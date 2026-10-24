from pathlib import Path
from PIL import Image
from torchvision.transforms.functional import to_tensor
import torch
from torchvision.models.detection import fasterrcnn_resnet50_fpn
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "faster_rcnn_sld.pth"

NUM_CLASSES = 11  # 10 object classes + background

CLASS_NAMES = [
    "__background__",  # Model label 0
    "CIRCUIT BREAKER",  # Model label 1
    "CURRENT TRANSFORMER",  # Model label 2
    "DIGITAL EARTH LEAKAGE RELAY",  # Model label 3
    "EARTH LEAKAGE RELAY",  # Model label 4
    "HRC FUSE WITH BLOWN FUSE INDICATOR",  # Model label 5
    "ISOLATOR",  # Model label 6
    "PHASE INDICATOR LIGHTS",  # Model label 7
    "SINGLE PHASE UNFUSED TAP OFF UNIT",  # Model label 8
    "TIME DELAY RELAY",  # Model label 9
    "ZERO PHASE SEQUENCE CURRENT TRANSFORMER",  # Model label 10
]


def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Checkpoint not found: {MODEL_PATH}")

    model = fasterrcnn_resnet50_fpn(
        weights=None,
        weights_backbone=None,
        min_size=800,
        max_size=1600,
    )

    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(
        in_features, NUM_CLASSES
    )

    state_dict = torch.load(
        MODEL_PATH,
        map_location="cpu",
        weights_only=True,
    )
    model.load_state_dict(state_dict, strict=True)
    model.eval()

    return model


def predict_image(model, image: Image.Image, confidence_threshold: float = 0.0):
    # Convert the image to RGB and then to a PyTorch tensor.
    image = image.convert("RGB")
    image_tensor = to_tensor(image)

    # Run object detection.
    with torch.no_grad():
        predictions = model([image_tensor])[0]

    detections = []

    for box, label, score in zip(
        predictions["boxes"],
        predictions["labels"],
        predictions["scores"],
    ):
        confidence = float(score.item())
        class_id = int(label.item())

        # Ignore low-confidence predictions and background.
        if confidence < confidence_threshold:
            continue

        if class_id <= 0 or class_id >= len(CLASS_NAMES):
            continue

        x1, y1, x2, y2 = box.tolist()

        detections.append({
            "class_id": class_id,
            "class_name": CLASS_NAMES[class_id],
            "confidence": round(confidence, 4),
            "box": {
                "x1": round(x1, 2),
                "y1": round(y1, 2),
                "x2": round(x2, 2),
                "y2": round(y2, 2),
            },
        })

    return detections


if __name__ == "__main__":
    print("Loading trained Faster R-CNN...")
    model = load_model()

    print("Model loaded successfully!")
    print(f"Number of classes: {NUM_CLASSES}")
    print("\nClass label mapping:")

    for label_id, class_name in enumerate(CLASS_NAMES):
        print(f"{label_id}: {class_name}")

