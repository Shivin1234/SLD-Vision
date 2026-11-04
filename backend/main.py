import io
import os
import json
import mimetypes
import torch
import traceback
import base64
import time
import uuid

from collections import Counter

from fastapi.middleware.cors import CORSMiddleware

from PIL import Image, ImageDraw, ImageFont
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Response, Form, Body

from database import (
    get_inference_history,
    save_inference_result,
    get_annotated_image,
    create_analysis_session,
    save_session_model_result,
    finalize_analysis_session,
    get_analysis_session,
    get_original_image,
    get_session_model_image,
)

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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Existing four models used by the normal application
models = {}

# New checkpoints are loaded only when Old vs New comparison is requested
comparison_models = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

NEW_CHECKPOINTS = {
    "frcnn": os.path.join(BASE_DIR, "models", "faster_rcnn_sld3.pth"),
    "retinanet": os.path.join(BASE_DIR, "models", "best_v3_best.pth"),
    "rtdetr_sahi": os.path.join(BASE_DIR, "models", "best (5).pt"),
    "rtdetrv2": os.path.join(BASE_DIR, "models", "rtdetrv2_new.pth"),
}



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

@app.post("/api/analysis-sessions")
async def create_history_session(
    file: UploadFile = File(...),
    analysis_type: str = Form(...),
    expected_model_ids: str = Form(...),
):
    try:
        image_bytes = await file.read()

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = image.size

        model_ids = json.loads(expected_model_ids)

        if not isinstance(model_ids, list) or not model_ids:
            raise HTTPException(
                status_code=400,
                detail="expected_model_ids must be a non-empty JSON list",
            )

        analysis_id = await create_analysis_session(
            image_name=file.filename or "uploaded_image",
            original_image_bytes=image_bytes,
            analysis_type=analysis_type,
            expected_model_ids=model_ids,
            width=width,
            height=height,
        )

        return {
            "analysis_id": analysis_id,
            "status": "Processing",
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def home():
    """Health check showing available models."""
    return {
        "status": "Online",
        "loaded_models": list(models.keys()),
        "device": str(DEVICE)
    }

def create_annotated_image(image: Image.Image, detections: list) -> bytes:
    """Draw detection boxes and labels and return a PNG as bytes."""

    annotated = image.copy().convert("RGB")
    draw = ImageDraw.Draw(annotated)

    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()

    for detection in detections:
        box = detection.get("box")

        if not box or len(box) != 4:
            continue

        try:
            x1, y1, x2, y2 = map(float, box)
        except (TypeError, ValueError):
            continue

        x1 = max(0, min(x1, annotated.width - 1))
        y1 = max(0, min(y1, annotated.height - 1))
        x2 = max(0, min(x2, annotated.width - 1))
        y2 = max(0, min(y2, annotated.height - 1))

        if x2 <= x1 or y2 <= y1:
            continue

        name = str(
            detection.get("name")
            or detection.get("class_name")
            or "Component"
        )

        confidence = detection.get("confidence")

        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = None

        if confidence is not None:
            # Support confidence values represented as either 0–1 or 0–100.
            percentage = confidence * 100 if confidence <= 1 else confidence
            label = f"{name} {percentage:.1f}%"
        else:
            label = name

        draw.rectangle(
            (x1, y1, x2, y2),
            outline="#00E676",
            width=3,
        )

        text_box = draw.textbbox((x1, y1), label, font=font)
        text_width = text_box[2] - text_box[0]
        text_height = text_box[3] - text_box[1]

        label_y = max(0, y1 - text_height - 8)

        draw.rectangle(
            (
                x1,
                label_y,
                x1 + text_width + 8,
                label_y + text_height + 6,
            ),
            fill="#008F50",
        )

        draw.text(
            (x1 + 4, label_y + 3),
            label,
            fill="white",
            font=font,
        )

    output = io.BytesIO()
    annotated.save(output, format="PNG")

    return output.getvalue()


@app.post("/api/predict")
async def predict_sld(
    file: UploadFile = File(...),
    model_type: str = Query("rtdetrv2", description="Choose from: rtdetrv2, frcnn, retinanet, rtdetr_sahi"),
    analysis_id: str | None = Query(None),
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

        # Generate the annotated image.
        annotated_image_bytes = create_annotated_image(
            image,
            detections,
)

# Save both detections and annotated image in MongoDB.
        if analysis_id:
            await save_session_model_result(
                analysis_id=analysis_id,
                model_id=model_type,
                model_name=model_type,
                detections=detections,
                total_components=total_components,
                annotated_image_bytes=annotated_image_bytes,
            )

            record_id = analysis_id
            annotated_image_url = (
                f"/api/history/{analysis_id}/models/{model_type}/image"
            )

        else:
            record_id = await save_inference_result(
                image_name=file.filename or "uploaded_image",
                model_name=model_type,
                detections=detections,
                total_components=total_components,
                annotated_image_bytes=annotated_image_bytes,
            )

            annotated_image_url = f"/api/history/{record_id}/image"

        return {
            "id": record_id,
            "analysis_id": analysis_id,
            "file_name": file.filename,
            "model_name": model_type,
            "total_components": total_components,
            "detections": detections,
            "annotated_image_url": annotated_image_url,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ==============================================================================
# OLD VS NEW CHECKPOINT COMPARISON
# ==============================================================================

def load_new_comparison_model(model_type: str):
    """Load and cache the new checkpoint for the selected architecture."""

    if model_type in comparison_models:
        return comparison_models[model_type]

    checkpoint_path = NEW_CHECKPOINTS[model_type]

    if not os.path.exists(checkpoint_path):
        raise HTTPException(
            status_code=404,
            detail=f"New checkpoint not found: {checkpoint_path}"
        )

    print(f"[INFO] Loading new {model_type} checkpoint...")

    if model_type == "frcnn":
        model = frcnn.load_model(checkpoint_path)

    elif model_type == "retinanet":
        model = RetinaNet.load_model(checkpoint_path, DEVICE)

    elif model_type == "rtdetr_sahi":
        model = Rtdetr.load_rtdetr_model(checkpoint_path)

    elif model_type == "rtdetrv2":
        model = RTDETRV2.load_rtdetrv2(
            checkpoint_path=checkpoint_path
        )

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported comparison model: {model_type}"
        )

    if model is None:
        raise RuntimeError(f"Failed to load new {model_type} checkpoint.")

    comparison_models[model_type] = model

    print(f"[OK] New {model_type} checkpoint loaded.")

    return model


def run_comparison_inference(
    model_type: str,
    model,
    image: Image.Image,
    image_path: str,
    width: int,
    height: int
):
    """Run inference and normalize detections into one common format."""

    start_time = time.perf_counter()
    detections = []

    if model_type == "frcnn":

        raw_detections = frcnn.predict_image_tiled(
            model,
            image,
            confidence_threshold=0.30,
            tile_size=800,
            overlap=0.2,
            iou_threshold=0.5
        )

        for idx, d in enumerate(raw_detections):

            box = d["box"]

            detections.append({
                "id": idx + 1,
                "class_id": d["class_id"],
                "code": d["class_name"][:4],
                "name": d["class_name"],
                "confidence": float(d["confidence"]),
                "box": [
                    box["x1"],
                    box["y1"],
                    box["x2"],
                    box["y2"]
                ]
            })

    elif model_type == "retinanet":

        result = RetinaNet.run_inference(
            model,
            image,
            DEVICE,
            confidence_threshold=0.3
        )

        for idx, d in enumerate(result.get("detections", [])):

            detections.append({
                "id": idx + 1,
                "class_id": d["class_id"],
                "code": d["class_name"][:4],
                "name": d["class_name"],
                "confidence": float(d["confidence"]),
                "box": d["bbox"]
            })

    elif model_type == "rtdetr_sahi":

        result = Rtdetr.execute_sliced_inference(
            image_path,
            model,
            width,
            height
        )

        for idx, d in enumerate(result.get("detections", [])):

            box = d["box"]

            detections.append({
                "id": idx + 1,
                "class_id": None,
                "code": d["tag"],
                "name": d["name"],
                "confidence": float(d["confidence"]) / 100.0,
                "box": [
                    box["x"],
                    box["y"],
                    box["x"] + box["w"],
                    box["y"] + box["h"]
                ]
            })

    elif model_type == "rtdetrv2":

        result = RTDETRV2.run_rtdetrv2_inference(
            model,
            image
        )

        for idx, d in enumerate(result.get("detections", [])):

            detections.append({
                "id": idx + 1,
                "class_id": d["class_id"],
                "code": d["code"],
                "name": d["name"],
                "confidence": float(d["confidence"]),
                "box": d["box"]
            })

    latency_ms = round(
        (time.perf_counter() - start_time) * 1000,
        1
    )

    # Generate BOM from normalized detections
    counts = Counter(d["name"] for d in detections)

    bom = []

    for component, quantity in counts.items():

        matching_detection = next(
            d for d in detections if d["name"] == component
        )

        bom.append({
            "tag": f'[{matching_detection["code"]}]',
            "component": component,
            "quantity": quantity
        })

    bom.sort(key=lambda x: x["quantity"], reverse=True)

    # Generate annotated image
    annotated_bytes = create_annotated_image(
        image,
        detections
    )

    annotated_base64 = base64.b64encode(
        annotated_bytes
    ).decode("utf-8")

    return {
        "latency_ms": latency_ms,
        "total_components": len(detections),
        "detections": detections,
        "bom": bom,
        "annotated_image_base64": annotated_base64
    }


@app.post("/api/compare-old-new/{model_type}")
async def compare_old_new(
    model_type: str,
    file: UploadFile = File(...)
):
    """
    Compare old and new checkpoints using the same uploaded image.

    This endpoint is temporary:
    - Does not create a History session.
    - Does not save results to MongoDB.
    """

    if model_type not in NEW_CHECKPOINTS:
        raise HTTPException(
            status_code=400,
            detail="Choose frcnn, retinanet, rtdetr_sahi, or rtdetrv2."
        )

    old_model = models.get(model_type)

    if old_model is None:
        raise HTTPException(
            status_code=400,
            detail=f"Old {model_type} model is not loaded."
        )

    temp_path = os.path.join(
        BASE_DIR,
        f"temp_compare_{uuid.uuid4().hex}.png"
    )

    try:

        image_bytes = await file.read()

        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        image = Image.open(
            io.BytesIO(image_bytes)
        ).convert("RGB")

        width, height = image.size

        # Load the new checkpoint only when requested
        new_model = load_new_comparison_model(model_type)

        # SAHI requires an image path
        image.save(temp_path, format="PNG")

        # Run both models on the same image
        old_result = run_comparison_inference(
            model_type,
            old_model,
            image,
            temp_path,
            width,
            height
        )

        new_result = run_comparison_inference(
            model_type,
            new_model,
            image,
            temp_path,
            width,
            height
        )

        return {
            "file_name": file.filename or "uploaded_image",
            "model_type": model_type,
            "image_width": width,
            "image_height": height,
            "old": old_result,
            "new": new_result
        }

    except HTTPException:
        raise

    except Exception as e:
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Old vs New comparison failed: {str(e)}"
        )

    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@app.get("/api/history")
async def read_history():
    try:
        return await get_inference_history(limit=100)
    except Exception as exc:
        print(f"History retrieval failed: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve history from database",
        )


@app.post("/api/analysis-sessions/{analysis_id}/finalize")
async def finalize_history_session(
    analysis_id: str,
    payload: dict = Body(...),
):
    try:
        session_models = payload.get("models")

        if not isinstance(session_models, dict) or not session_models:
            raise HTTPException(
                status_code=400,
                detail="A non-empty models object is required",
            )

        await finalize_analysis_session(
            analysis_id=analysis_id,
            models=session_models,
        )

        return {
            "analysis_id": analysis_id,
            "status": "Completed",
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/{analysis_id}")
async def read_analysis_session(analysis_id: str):
    try:
        session = await get_analysis_session(analysis_id)

        if session is None:
            raise HTTPException(
                status_code=404,
                detail="Analysis session not found",
            )

        return session

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/{analysis_id}/original-image")
async def read_original_image(analysis_id: str):
    try:
        image_bytes = await get_original_image(analysis_id)

        if image_bytes is None:
            raise HTTPException(
                status_code=404,
                detail="Original image not found",
            )

        session = await get_analysis_session(analysis_id)
        filename = session.get("image_name", "") if session else ""
        media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

        return Response(
            content=image_bytes,
            media_type=media_type,
            headers={"Cache-Control": "no-store"},
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/{analysis_id}/models/{model_id}/image")
async def read_session_model_image(
    analysis_id: str,
    model_id: str,
):
    try:
        image_bytes = await get_session_model_image(
            analysis_id,
            model_id,
        )

        if image_bytes is None:
            raise HTTPException(
                status_code=404,
                detail="Annotated model image not found",
            )

        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={"Cache-Control": "no-store"},
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history/{record_id}/image")
async def read_annotated_image(record_id: str):

    try:
        image_bytes = await get_annotated_image(record_id)

        if image_bytes is None:
            raise HTTPException(
                status_code=404,
                detail="Annotated image not found for this history record",
            )

        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": 'inline; filename="annotated.png"',
                "Cache-Control": "no-store",
            },
        )

    except HTTPException:
        raise

    except Exception:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve annotated image",
        )

    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
