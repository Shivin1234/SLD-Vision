import io
import os
import torch
import traceback
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException, Query

# Import database helper
from database import save_inference_result

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

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Global variables to store loaded models in memory
models = {}

@app.on_event("startup")
async def load_all_models():
    """Load available models into memory at startup."""
    print("🚀 Initializing AI models on startup...")

    # 1. Faster R-CNN
    try:
        frcnn_path = os.path.join(
            os.path.dirname(__file__), "models", "faster_rcnn_sld.pth"
        )
        if os.path.exists(frcnn_path):
            model = frcnn.load_model()
            if model is not None:
                models["frcnn"] = model
                print("✅ Faster R-CNN loaded.")
            else:
                print("⚠️ Faster R-CNN loader returned None.")
        else:
            print(f"⚠️ Faster R-CNN checkpoint not found: {frcnn_path}")
    except Exception as e:
        print(f"⚠️ Failed to load Faster R-CNN: {e}")
        traceback.print_exc()

    # 2. RetinaNet
    try:
        retinanet_path = os.path.join(
            os.path.dirname(__file__), "models", "retinanet_sld.pth"
        )
        if os.path.exists(retinanet_path):
            model = RetinaNet.load_model(retinanet_path, DEVICE)
            if model is not None:
                models["retinanet"] = model
                print("✅ RetinaNet loaded.")
            else:
                print("⚠️ RetinaNet loader returned None.")
        else:
            print(f"⚠️ RetinaNet checkpoint not found: {retinanet_path}")
    except Exception as e:
        print(f"⚠️ Failed to load RetinaNet: {e}")
        traceback.print_exc()

    # 3. RT-DETR (SAHI)
    try:
        rtdetr_path = os.path.join(
            os.path.dirname(__file__), "models", "rtdetr_sld.pt"
        )
        if os.path.exists(rtdetr_path):
            if Rtdetr.rtdetr_model is not None:
                models["rtdetr_sahi"] = Rtdetr.rtdetr_model
                print("✅ RT-DETR (SAHI) loaded.")
            else:
                print("⚠️ RT-DETR checkpoint exists, but model loading failed.")
        else:
            print(f"⚠️ RT-DETR checkpoint not found: {rtdetr_path}")
    except Exception as e:
        print(f"⚠️ Failed to load RT-DETR (SAHI): {e}")
        traceback.print_exc()

    # 4. RT-DETRv2
    try:
        rtdetrv2_path = os.path.join(
            os.path.dirname(__file__), "models", "rtdetrv2_sld.pth"
        )
        if os.path.exists(rtdetrv2_path):
            model = RTDETRV2.load_rtdetrv2()
            if model is not None:
                models["rtdetrv2"] = model
                print("✅ RT-DETRv2 loaded.")
            else:
                print("⚠️ RT-DETRv2 loader returned None.")
        else:
            print(f"⚠️ RT-DETRv2 checkpoint not found: {rtdetrv2_path}")
    except Exception as e:
        print(f"⚠️ Failed to load RT-DETRv2: {e}")
        traceback.print_exc()

    print("Available models:", list(models.keys()))


@app.get("/")
def home():
    """Health check showing available models."""
    return {
        "status": "Online",
        "loaded_models": list(models.keys()),
        "device": str(DEVICE)
    }


@app.post("/api/predict")
async def predict_sld(
    file: UploadFile = File(...),
    model_type: str = Query("rtdetrv2", description="Choose from: rtdetrv2, frcnn, retinanet, rtdetr_sahi")
):
    """
    Accepts an image and a model_type query parameter, runs the chosen AI model,
    saves the detection results into MongoDB, and returns the output.
    """
    if model_type not in models or models[model_type] is None:
        raise HTTPException(
            status_code=400, 
            detail=f"Model '{model_type}' is not loaded or invalid. Available: {list(models.keys())}"
        )

    try:
        # Read image bytes
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        W, H = image.size

        detections = []

        # --- RUN INFERENCE BASED ON SELECTED MODEL ---
        if model_type == "rtdetrv2":
            res = RTDETRV2.run_rtdetrv2_inference(models["rtdetrv2"], image)
            detections = res.get("detections", [])

        elif model_type == "frcnn":
            raw_dets = frcnn.predict_image_tiled(
                models["frcnn"],
                image,
                confidence_threshold=0.30,
                tile_size=800,
                overlap=0.2,
                iou_threshold=0.5,
            )

            for idx, d in enumerate(raw_dets):
                box_coords = [
                    d["box"]["x1"],
                    d["box"]["y1"],
                    d["box"]["x2"],
                    d["box"]["y2"],
                ]

                detections.append({
                    "id": idx + 1,
                    "class_id": d["class_id"],
                    "code": d["class_name"][:4],
                    "name": d["class_name"],
                    "confidence": d["confidence"],
                    "box": box_coords,
                })

        elif model_type == "retinanet":
            res = RetinaNet.run_inference(models["retinanet"], image, DEVICE, confidence_threshold=0.3)
            for idx, d in enumerate(res.get("detections", [])):
                detections.append({
                    "id": idx + 1,
                    "class_id": d["class_id"],
                    "code": d["class_name"][:4],
                    "name": d["class_name"],
                    "confidence": d["confidence"],
                    "box": d["bbox"]
                })

        elif model_type == "rtdetr_sahi":
            temp_path = f"temp_{file.filename}"
            with open(temp_path, "wb") as f:
                f.write(image_bytes)
            
            res = Rtdetr.execute_sliced_inference(temp_path, models["rtdetr_sahi"], W, H)
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
                    "code": d["tag"],
                    "name": d["name"],
                    "confidence": d["confidence"] / 100.0,
                    "box": [bx, by, bx + bw, by + bh]
                })

        total_components = len(detections)

        # Save record to MongoDB with the specific model name tag
        await save_inference_result(
            image_name=file.filename,
            model_name=model_type,
            detections=detections,
            total_components=total_components
        )

        return {
            "file_name": file.filename,
            "model_name": model_type,
            "total_components": total_components,
            "detections": detections
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
