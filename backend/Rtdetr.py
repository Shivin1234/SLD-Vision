# ==============================================================================
# SLD CAD AI BACKEND (FastAPI + RT-DETR SAHI Sliced Inference)
# ==============================================================================
import os
import sys
import shutil
import uuid
import time
import traceback
from collections import Counter
from PIL import Image

import torch
from fastapi import FastAPI, UploadFile, File, HTTPException

# SAHI for RT-DETR Sliced Tiling
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction

app = FastAPI(title="SLD CAD AI - RT-DETR Detection API")

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ------------------------------------------------------------------------------
# 1. Engineering Tag Mappings
# ------------------------------------------------------------------------------
SHORT_TAGS = {
    'CURRENT TRANSFORMER': 'CT',
    'CIRCUIT BREAKER': 'CB',
    'HRC FUSE WITH BLOWN FUSE INDICATOR': 'FUSE',
    'PHASE INDICATOR LIGHTS': 'PIL',
    'ISOLATOR': 'ISO',
    'SINGLE PHASE UNFUSED TAP OFF UNIT': 'TAP-OFF',
    'ZERO PHASE SEQUENCE CURRENT TRANSFORMER': 'ZCT',
    'DIGITAL EARTH LEAKAGE RELAY': 'DELR',
    'EARTH LEAKAGE RELAY': 'ELR',
    'TIME DELAY RELAY': 'TDR'
}

# ------------------------------------------------------------------------------
# 2. Load RT-DETR Model on Startup
# ------------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

RTDETR_MODEL_PATH = os.path.join(BASE_DIR, "models", "rtdetr_sld.pt")

print(f"[INFO] Computing device: {str(device).upper()}")

rtdetr_model = None
if os.path.exists(RTDETR_MODEL_PATH):
    print(f"[INFO] Loading RT-DETR model from {RTDETR_MODEL_PATH}...")
    rtdetr_model = AutoDetectionModel.from_pretrained(
        model_type="yolov8",
        model_path=RTDETR_MODEL_PATH,
        confidence_threshold=0.30,
        device=str(device)
    )
    print("[OK] RT-DETR Model loaded successfully!")
else:
    print(f"[WARN] RT-DETR checkpoint not found at {RTDETR_MODEL_PATH}")

# ------------------------------------------------------------------------------
# 3. Core Sliced Inference Engine (SAHI)
# ------------------------------------------------------------------------------
def execute_sliced_inference(image_path: str, model_instance, img_w: int, img_h: int):
    t0 = time.perf_counter()
    
    with torch.inference_mode():
        result = get_sliced_prediction(
            image_path,
            model_instance,
            slice_height=640,
            slice_width=640,
            overlap_height_ratio=0.25,
            overlap_width_ratio=0.25,
            postprocess_type="NMS",
            postprocess_match_metric="IOU",
            postprocess_match_threshold=0.35,
            perform_standard_pred=True
        )
    
    latency_ms = round((time.perf_counter() - t0) * 1000, 1)

    detections = []
    names = []

    for obj in result.object_prediction_list:
        comp_name = obj.category.name
        if comp_name == '__background__' or not comp_name:
            continue

        names.append(comp_name)
        bbox = obj.bbox

        bx = int(bbox.minx)
        by = int(bbox.miny)
        bw = int(bbox.maxx - bbox.minx)
        bh = int(bbox.maxy - bbox.miny)

        # Padding for bounding box
        pad_x = max(4, int(bw * 0.25))
        pad_top = max(5, int(bh * 0.40))
        pad_bottom = max(3, int(bh * 0.15))

        final_x = max(0, bx - pad_x)
        final_y = max(0, by - pad_top)
        final_w = min(img_w - final_x, bw + (pad_x * 2))
        final_h = min(img_h - final_y, bh + pad_top + pad_bottom)

        detections.append({
            "name": comp_name,
            "tag": SHORT_TAGS.get(comp_name, comp_name[:4] if comp_name else "TAG"),
            "confidence": round(float(obj.score.value) * 100, 1),
            "box": {
                "x": final_x,
                "y": final_y,
                "w": final_w,
                "h": final_h
            }
        })

    # Bill of Materials (BOM) summary
    counts = Counter(names)
    bom = []
    for c_name, qty in counts.items():
        tag = SHORT_TAGS.get(c_name, 'TAG')
        bom.append({
            "tag": f"[{tag}]",
            "component": c_name,
            "quantity": qty
        })

    return {
        "latency_ms": latency_ms,
        "total": len(detections),
        "detections": detections,
        "bom": sorted(bom, key=lambda x: x["quantity"], reverse=True)
    }

# ------------------------------------------------------------------------------
# 4. API Endpoints
# ------------------------------------------------------------------------------
@app.get("/")
def home():
    return {
        "status": "Online",
        "model": "RT-DETR-L (Transformer)",
        "model_loaded": rtdetr_model is not None,
        "device": str(device)
    }

@app.post("/api/detect")
def detect_symbols(file: UploadFile = File(...)):
    if rtdetr_model is None:
        raise HTTPException(status_code=500, detail="RT-DETR model is not loaded.")

    unique_id = uuid.uuid4().hex[:8]
    temp_path = f"temp_{unique_id}_{file.filename}"

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        with Image.open(temp_path) as img:
            img_w, img_h = img.size

        output = execute_sliced_inference(temp_path, rtdetr_model, img_w, img_h)

        return {
            "fileName": file.filename,
            "model_name": "RT-DETR-L (Transformer)",
            "architecture": "Single-Stage Real-Time Transformer",
            "latency_ms": output["latency_ms"],
            "width": img_w,
            "height": img_h,
            "total": output["total"],
            "detections": output["detections"],
            "bom": output["bom"]
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)

