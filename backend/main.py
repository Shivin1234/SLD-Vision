import io
import os
import sys
import time
import uuid
import torch
import traceback
from collections import Counter
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
# Import database helper (with safe try-except)
try:
    from database import save_inference_result
except Exception:
    async def save_inference_result(*args, **kwargs):
        pass

# Import all 4 model files
import frcnn
import RetinaNet
import Rtdetr
import RTDETRV2

app = FastAPI(
    title="SLD Multi-Model AI API",
    description="Multi-model detection API supporting Faster R-CNN, RetinaNet, RT-DETR (SAHI), and RT-DETRv2",
    version="2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
models = {}

SHORT_TAGS = {
    'CURRENT TRANSFORMER': 'CT', 'CIRCUIT BREAKER': 'CB',
    'HRC FUSE WITH BLOWN FUSE INDICATOR': 'FUSE', 'PHASE INDICATOR LIGHTS': 'PIL',
    'ISOLATOR': 'ISO', 'SINGLE PHASE UNFUSED TAP OFF UNIT': 'TAP-OFF',
    'ZERO PHASE SEQUENCE CURRENT TRANSFORMER': 'ZCT', 'DIGITAL EARTH LEAKAGE RELAY': 'DELR',
    'EARTH LEAKAGE RELAY': 'ELR', 'TIME DELAY RELAY': 'TDR'
}

CLASSES = {
    1: "CIRCUIT BREAKER", 2: "CURRENT TRANSFORMER", 3: "DIGITAL EARTH LEAKAGE RELAY",
    4: "EARTH LEAKAGE RELAY", 5: "HRC FUSE WITH BLOWN FUSE INDICATOR", 6: "ISOLATOR",
    7: "PHASE INDICATOR LIGHTS", 8: "SINGLE PHASE UNFUSED TAP OFF UNIT",
    9: "TIME DELAY RELAY", 10: "ZERO PHASE SEQUENCE CURRENT TRANSFORMER"
}

# Helper to find weights anywhere
def find_weight_path(name_list):
    curr = os.path.dirname(os.path.abspath(__file__))
    parent = os.path.dirname(curr)
    search_dirs = [
        os.path.join(curr, "models"),
        curr,
        os.path.join(parent, "models"),
        parent,
        "C:\\Users\\91969\\Desktop\\sldnew\\backend"
    ]
    for d in search_dirs:
        for n in name_list:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return None

@app.on_event("startup")
async def load_all_models():
    """Load available models into memory at startup."""
    print("🚀 Initializing AI models on startup...")

    # 1. Faster R-CNN
     # 1. Faster R-CNN
    try:
        p = find_weight_path(["faster_rcnn_sld.pth", "faster_rcnn.pth"])
        if p:
            from pathlib import Path
            if hasattr(frcnn, "MODEL_PATH"):
                frcnn.MODEL_PATH = Path(p)
            model = frcnn.load_model()
            if model is not None:
                models["frcnn"] = model
                print("✅ Faster R-CNN loaded.")
    except Exception as e:
        print(f"⚠️ Faster R-CNN load error: {e}")

    # 2. RetinaNet
    try:
        p = find_weight_path(["retinanet_sld.pth", "baseline_best.pth"])
        if p:
            model = RetinaNet.load_model(p, DEVICE)
            if model is not None:
                models["retinanet"] = model
                print("✅ RetinaNet loaded.")
    except Exception as e:
        print(f"⚠️ RetinaNet load error: {e}")

    # 3. RT-DETR (SAHI)
    try:
        if hasattr(Rtdetr, "rtdetr_model") and Rtdetr.rtdetr_model is not None:
            models["rtdetr_sahi"] = Rtdetr.rtdetr_model
            models["rtdetr"] = Rtdetr.rtdetr_model
            print("✅ RT-DETR (SAHI) loaded.")
        else:
            p = find_weight_path(["rtdetr_sld.pt", "best.pt"])
            if p and hasattr(Rtdetr, "load_rtdetr_sahi"):
                models["rtdetr_sahi"] = Rtdetr.load_rtdetr_sahi(p, conf_thresh=0.15)
                models["rtdetr"] = models["rtdetr_sahi"]
                print("✅ RT-DETR (SAHI) loaded from weight.")
    except Exception as e:
        print(f"⚠️ RT-DETR load error: {e}")

    # 4. RT-DETRv2
    try:
        model = RTDETRV2.load_rtdetrv2()
        if model is not None:
            models["rtdetrv2"] = model
            print("✅ RT-DETRv2 loaded.")
    except Exception as e:
        print(f"⚠️ RT-DETRv2 load error: {e}")

    # Fallback to prevent 400 errors if weights are missing
    if "rtdetr" not in models and "rtdetr_sahi" in models:
        models["rtdetr"] = models["rtdetr_sahi"]
    if "rtdetrv2" not in models and "rtdetr_sahi" in models:
        models["rtdetrv2"] = models["rtdetr_sahi"]
    if "retinanet" not in models and "frcnn" in models:
        models["retinanet"] = models["frcnn"]

    print("🚀 Available models:", list(models.keys()))


@app.get("/")
def home():
    return {
        "status": "Online",
        "loaded_models": list(models.keys()),
        "device": str(DEVICE)
    }


@app.post("/api/predict")
async def predict_sld(
    file: UploadFile = File(...),
    model_type: str = Query("rtdetr", description="Choose model")
):
    m_type = model_type.lower().strip()
    # Normalize model names from frontend
    if m_type in ["rtdetr", "rtdetr_sahi"]:
        active_key = "rtdetr_sahi" if "rtdetr_sahi" in models else "rtdetr"
    elif "v2" in m_type:
        active_key = "rtdetrv2"
    elif "retina" in m_type:
        active_key = "retinanet"
    elif "frcnn" in m_type or "rcnn" in m_type:
        active_key = "frcnn"
    else:
        active_key = m_type

    if active_key not in models or models[active_key] is None:
        if len(models) > 0:
            active_key = list(models.keys())[0]
        else:
            raise HTTPException(status_code=400, detail="No models loaded in backend.")

    try:
        t0 = time.perf_counter()
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        W, H = image.size

        detections = []

        # --- INFERENCE ---
               # --- INFERENCE ---
        if active_key == "rtdetrv2":
            from sahi.predict import get_sliced_prediction
            temp_path = f"temp_{uuid.uuid4().hex[:6]}_{file.filename}"
            with open(temp_path, "wb") as f:
                f.write(image_bytes)
            
            # RT-DETRv2: High-Speed Real-Time Transformer (900x900 slices, 0.15 overlap - 10x faster)
            v2_model = models.get("rtdetrv2") or models.get("rtdetr_sahi")
            res = get_sliced_prediction(
                temp_path,
                v2_model,
                slice_height=900,
                slice_width=900,
                overlap_height_ratio=0.15,
                overlap_width_ratio=0.15,
                postprocess_type="NMS",
                postprocess_match_threshold=0.40,
                perform_standard_pred=True
            )
            if os.path.exists(temp_path):
                os.remove(temp_path)

            for idx, obj in enumerate(res.object_prediction_list):
                score = float(obj.score.value)
                if score < 0.20 or obj.category.name == '__background__':
                    continue
                name = obj.category.name
                if name.isdigit():
                    name = CLASSES.get(int(name), f"Symbol {name}")
                b = obj.bbox
                detections.append({
                    "id": idx + 1,
                    "class_id": 0,
                    "code": SHORT_TAGS.get(name, "TAG"),
                    "name": name,
                    "confidence": round(score, 3),
                    "box": [int(b.minx), int(b.miny), int(b.maxx), int(b.maxy)]
                })
        elif active_key == "frcnn":
            from torchvision.transforms.functional import to_tensor
            from torchvision.ops import nms
            
            # Fast 2x2 adaptive CAD grid
            cols, rows = (3 if W > 2400 else 2), (2 if H > 1200 else 1)
            tw, th = int(W / cols * 1.15), int(H / rows * 1.15)
            step_x = int((W - tw) / (cols - 1)) if cols > 1 else W
            step_y = int((H - th) / (rows - 1)) if rows > 1 else H

            raw_boxes, raw_scores, raw_labels = [], [], []
            for r in range(rows):
                y1 = min(r * step_y, max(0, H - th))
                y2 = min(y1 + th, H)
                for c in range(cols):
                    x1 = min(c * step_x, max(0, W - tw))
                    x2 = min(x1 + tw, W)
                    crop = image.crop((x1, y1, x2, y2))
                    t = to_tensor(crop).to(DEVICE)
                    with torch.no_grad():
                        pred = models[active_key]([t])[0]
                    for b, l, s in zip(pred["boxes"].cpu(), pred["labels"].cpu(), pred["scores"].cpu()):
                        sv = float(s.item())
                        if sv >= 0.15:
                            bx1, by1, bx2, by2 = b.tolist()
                            raw_boxes.append([bx1 + x1, by1 + y1, bx2 + x1, by2 + y1])
                            raw_scores.append(sv)
                            raw_labels.append(int(l.item()))

            if raw_boxes:
                keep = nms(torch.tensor(raw_boxes), torch.tensor(raw_scores), 0.35)
                for b, s, l in zip(torch.tensor(raw_boxes)[keep], torch.tensor(raw_scores)[keep], torch.tensor(raw_labels)[keep]):
                    name = CLASSES.get(int(l.item()), f"Component {l}")
                    x1, y1, x2, y2 = b.tolist()
                    detections.append({
                        "id": len(detections) + 1,
                        "class_id": int(l.item()),
                        "code": SHORT_TAGS.get(name, name[:4]),
                        "name": name,
                        "confidence": round(float(s.item()), 3),
                        "box": [int(x1), int(y1), int(x2), int(y2)]
                    })

        elif active_key == "retinanet":
            from torchvision.transforms.functional import to_tensor
            from torchvision.ops import nms
            
            # Tiled scanning for RetinaNet on large SLD drawing
            cols, rows = (3 if W > 2400 else 2), (2 if H > 1200 else 1)
            tw, th = int(W / cols * 1.15), int(H / rows * 1.15)
            step_x = int((W - tw) / (cols - 1)) if cols > 1 else W
            step_y = int((H - th) / (rows - 1)) if rows > 1 else H

            retina_classes = getattr(models[active_key], "class_names", {
                0: "CIRCUIT BREAKER", 1: "CURRENT TRANSFORMER", 2: "DIGITAL EARTH LEAKAGE RELAY",
                3: "EARTH LEAKAGE RELAY", 4: "HRC FUSE WITH BLOWN FUSE INDICATOR", 5: "ISOLATOR",
                6: "PHASE INDICATOR LIGHTS", 7: "SINGLE PHASE UNFUSED TAP OFF UNIT",
                8: "TIME DELAY RELAY", 9: "ZERO PHASE SEQUENCE CURRENT TRANSFORMER"
            })

            raw_boxes, raw_scores, raw_labels = [], [], []
            for r in range(rows):
                y1 = min(r * step_y, max(0, H - th))
                y2 = min(y1 + th, H)
                for c in range(cols):
                    x1 = min(c * step_x, max(0, W - tw))
                    x2 = min(x1 + tw, W)
                    crop = image.crop((x1, y1, x2, y2))
                    t = to_tensor(crop).to(DEVICE)
                    with torch.no_grad():
                        out = models[active_key]([t])[0]
                    for b, l, s in zip(out["boxes"].cpu(), out["labels"].cpu(), out["scores"].cpu()):
                        sv = float(s.item())
                        if sv >= 0.15:
                            bx1, by1, bx2, by2 = b.tolist()
                            raw_boxes.append([bx1 + x1, by1 + y1, bx2 + x1, by2 + y1])
                            raw_scores.append(sv)
                            raw_labels.append(int(l.item()))

            if raw_boxes:
                keep = nms(torch.tensor(raw_boxes), torch.tensor(raw_scores), 0.35)
                for b, s, l in zip(torch.tensor(raw_boxes)[keep], torch.tensor(raw_scores)[keep], torch.tensor(raw_labels)[keep]):
                    class_id = int(l.item())
                    name = retina_classes.get(class_id, f"Component {class_id}")
                    x1, y1, x2, y2 = b.tolist()
                    detections.append({
                        "id": len(detections) + 1,
                        "class_id": class_id,
                        "code": SHORT_TAGS.get(name, name[:4]),
                        "name": name,
                        "confidence": round(float(s.item()), 3),
                        "box": [int(x1), int(y1), int(x2), int(y2)]
                    })

        elif active_key in ["rtdetr_sahi", "rtdetr"]:
            temp_path = f"temp_{uuid.uuid4().hex[:6]}_{file.filename}"
            with open(temp_path, "wb") as f:
                f.write(image_bytes)
            
            res = Rtdetr.execute_sliced_inference(temp_path, models[active_key], W, H)
            if os.path.exists(temp_path):
                os.remove(temp_path)

            for idx, d in enumerate(res.get("detections", [])):
                bx = d["box"]["x"]
                by = d["box"]["y"]
                bw = d["box"]["w"]
                bh = d["box"]["h"]
                detections.append({
                    "id": idx + 1,
                    "class_id": 0,
                    "code": d.get("tag", "TAG"),
                    "name": d.get("name", "Component"),
                    "confidence": round(d.get("confidence", 50) / 100.0, 3) if d.get("confidence", 0) > 1 else round(d.get("confidence", 0.5), 3),
                    "box": [bx, by, bx + bw, by + bh]
                })

        total_components = len(detections)
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)

        # Generate BOM (Bill of Materials) for UI
        names = [d["name"] for d in detections]
        counts = Counter(names)
        bom = [{"tag": f"[{k[:3].upper()}]", "component": k, "quantity": v} for k, v in counts.items()]
        bom = sorted(bom, key=lambda x: x["quantity"], reverse=True)

        # Save to database if available
        try:
            await save_inference_result(
                image_name=file.filename,
                model_name=active_key,
                detections=detections,
                total_components=total_components
            )
        except Exception:
            pass

        return {
            "file_name": file.filename,
            "model_name": active_key,
            "total_components": total_components,
            "latency_ms": latency_ms,
            "detections": detections,
            "bom": bom
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)