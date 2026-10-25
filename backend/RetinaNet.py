"""
Model loading and inference module for SLD RetinaNet detection.
Uses the exact same architecture, class mapping, preprocessing, and post-processing
as the original training code (config.py, utils.py, dataset.py).
Supports dynamic checkpoint loading (10-class ) and optional tiling.
"""

import time
from pathlib import Path
from functools import partial
from typing import Dict, List, Any, Tuple, Optional

import numpy as np
import torch
import torch.nn as nn
from torchvision.models.detection import (
    retinanet_resnet50_fpn_v2,
    RetinaNet_ResNet50_FPN_V2_Weights,
)
from torchvision.models.detection.retinanet import RetinaNetClassificationHead
from torchvision.transforms.functional import to_tensor
from PIL import Image

SYMBOL_COLORS = {
    "CIRCUIT BREAKER": (30, 144, 255),
    "CURRENT TRANSFORMER": (50, 205, 50),
    "DIGITAL EARTH LEAKAGE RELAY": (255, 165, 0),
    "EARTH LEAKAGE RELAY": (148, 103, 189),
    "HRC FUSE WITH BLOWN FUSE INDICATOR": (255, 20, 147),
    "ISOLATOR": (0, 191, 255),
    "PHASE INDICATOR LIGHTS": (255, 215, 0),
    "SINGLE PHASE UNFUSED TAP OFF UNIT": (0, 255, 127),
    "TIME DELAY RELAY": (220, 20, 60),
    "ZERO PHASE SEQUENCE CURRENT TRANSFORMER": (64, 224, 208),
}

CLASS_NAMES = {
    0: "CIRCUIT BREAKER",
    1: "CURRENT TRANSFORMER",
    2: "DIGITAL EARTH LEAKAGE RELAY",
    3: "EARTH LEAKAGE RELAY",
    4: "HRC FUSE WITH BLOWN FUSE INDICATOR",
    5: "ISOLATOR",
    6: "PHASE INDICATOR LIGHTS",
    7: "SINGLE PHASE UNFUSED TAP OFF UNIT",
    8: "TIME DELAY RELAY",
    9: "ZERO PHASE SEQUENCE CURRENT TRANSFORMER",
}

NUM_CLASSES = 10

CLASS_COLORS = {
    label_id: SYMBOL_COLORS[name]
    for label_id, name in CLASS_NAMES.items()
}

# Default 11-category mapping from config.py (10 classes with background at 0)

# Fallback global references
# The checkpoint uses 10 foreground classes with labels 0–9.
# Do not include SLD-ANNOTATION in the fallback mapping.

CLASS_NAMES = {
    0: "CIRCUIT BREAKER",
    1: "CURRENT TRANSFORMER",
    2: "DIGITAL EARTH LEAKAGE RELAY",
    3: "EARTH LEAKAGE RELAY",
    4: "HRC FUSE WITH BLOWN FUSE INDICATOR",
    5: "ISOLATOR",
    6: "PHASE INDICATOR LIGHTS",
    7: "SINGLE PHASE UNFUSED TAP OFF UNIT",
    8: "TIME DELAY RELAY",
    9: "ZERO PHASE SEQUENCE CURRENT TRANSFORMER",
}

NUM_CLASSES = len(CLASS_NAMES)

CLASS_COLORS = {
    label_id: SYMBOL_COLORS.get(name, (200, 200, 200))
    for label_id, name in CLASS_NAMES.items()
}


def build_model(num_classes: int = NUM_CLASSES, pretrained: bool = False) -> nn.Module:
    """
    Build RetinaNet ResNet-50 FPN v2 with modified classification head.
    Matches utils.build_model from training code.
    """
    weights = RetinaNet_ResNet50_FPN_V2_Weights.DEFAULT if pretrained else None
    model = retinanet_resnet50_fpn_v2(weights=weights)

    channels = model.head.classification_head.cls_logits.in_channels
    anchors = model.head.classification_head.num_anchors
    norm_layer = partial(nn.GroupNorm, 32)

    model.head.classification_head = RetinaNetClassificationHead(
        channels, anchors, num_classes, norm_layer=norm_layer
    )
    return model


def load_model(checkpoint_path: str, device: torch.device) -> nn.Module:
    """
    Load the trained RetinaNet model from a checkpoint file.
    Dynamically inspects the checkpoint to handle both 10-class (best_v3)
    and 12-class (baseline/tuned) architectures seamlessly.
    """
    path = Path(checkpoint_path)
    if not path.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {path}")

    checkpoint = torch.load(path, map_location=device, weights_only=False)

    if "model_state_dict" not in checkpoint:
        raise KeyError(f"Checkpoint at {path} does not contain 'model_state_dict'.")

    # Determine class count dynamically from weights
    state_dict = checkpoint["model_state_dict"]
    weight_key = "head.classification_head.cls_logits.weight"
    if weight_key in state_dict:
        total_out = state_dict[weight_key].shape[0]
        # In RetinaNet, total_out = num_anchors (9) * num_classes
        ckpt_classes = total_out // 9
    else:
        ckpt_classes = checkpoint.get("num_classes", NUM_CLASSES)

    model = build_model(num_classes=ckpt_classes, pretrained=False)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    # Determine class names and color map for this specific checkpoint
    raw_class_names = checkpoint.get("class_names")
    if raw_class_names:
        # Convert any string keys to int
        model_class_names = {int(k): v for k, v in raw_class_names.items()}
    else:
        model_class_names = CLASS_NAMES

    model.class_names = model_class_names
    model.class_colors = {
        label_int: SYMBOL_COLORS.get(name, (200, 200, 200))
        for label_int, name in model_class_names.items()
    }
    model.num_classes = ckpt_classes

    # Store checkpoint metadata
    model._checkpoint_info = {
        "epoch": checkpoint.get("epoch"),
        "best_val_loss": checkpoint.get("best_val_loss"),
        "config_name": checkpoint.get("config", {}).get("name"),
        "num_classes": ckpt_classes,
        "classes": list(model_class_names.values()),
    }

    return model


def preprocess_image(pil_image: Image.Image) -> torch.Tensor:
    """
    Preprocess a PIL image for RetinaNet inference.
    PIL RGB -> to_tensor() [float32 0-1].
    """
    img_rgb = pil_image.convert("RGB")
    return to_tensor(img_rgb)


def run_inference(
    model: nn.Module,
    pil_image: Image.Image,
    device: torch.device,
    confidence_threshold: float = 0.25,
) -> Dict[str, Any]:
    """
    Run standard single-pass inference on a PIL image.
    """
    img_tensor = preprocess_image(pil_image)
    img_width, img_height = pil_image.size

    start_time = time.perf_counter()

    with torch.no_grad():
        outputs = model([img_tensor.to(device)])

    inference_time_ms = (time.perf_counter() - start_time) * 1000.0

    out = outputs[0]
    boxes = out["boxes"].cpu().numpy()
    scores = out["scores"].cpu().numpy()
    labels = out["labels"].cpu().numpy()

    class_names = getattr(model, "class_names", CLASS_NAMES)
    class_colors = getattr(model, "class_colors", CLASS_COLORS)

    detections = []
    class_counts: Dict[str, int] = {}

    for box, score, label in zip(boxes, scores, labels):
        if score < confidence_threshold:
            continue

        label_int = int(label)
        if label_int not in class_names:
            continue

        x1, y1, x2, y2 = map(float, box)
        w, h = x2 - x1, y2 - y1
        if w <= 0 or h <= 0:
            continue

        c_name = class_names[label_int]
        c_color = class_colors.get(label_int, (200, 200, 200))

        detections.append({
            "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
            "class_name": c_name,
            "class_id": label_int,
            "confidence": round(float(score), 4),
            "color": list(c_color),
        })

        class_counts[c_name] = class_counts.get(c_name, 0) + 1

    detections.sort(key=lambda d: d["confidence"], reverse=True)

    return {
        "detections": detections,
        "total_detections": len(detections),
        "class_counts": class_counts,
        "inference_time_ms": round(inference_time_ms, 2),
        "image_size": {"width": img_width, "height": img_height},
        "tiling_info": {"enabled": False},
    }


def draw_detections(
    pil_image: Image.Image,
    detections: List[Dict[str, Any]],
    tile_grid: Optional[List[Dict[str, int]]] = None,
) -> Image.Image:
    """
    Draw bounding boxes, class labels, confidence scores,
    and optionally tile boundaries on the image.
    Returns a new annotated PIL Image.
    """
    from PIL import ImageDraw, ImageFont

    annotated = pil_image.convert("RGB").copy()
    draw = ImageDraw.Draw(annotated)

    # Optional: draw subtle tile boundaries if provided
    if tile_grid:
        for t in tile_grid:
            draw.rectangle(
                [t["xmin"], t["ymin"], t["xmax"], t["ymax"]],
                outline=(100, 149, 237),
                width=1,
            )

    try:
        small_font = ImageFont.truetype("arial.ttf", size=11)
    except (IOError, OSError):
        try:
            small_font = ImageFont.truetype("DejaVuSans.ttf", size=11)
        except (IOError, OSError):
            small_font = ImageFont.load_default()

    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        color = tuple(det["color"])
        class_name = det["class_name"]
        confidence = det["confidence"]
        label_text = f"{class_name} {confidence:.0%}"

        # Draw bounding box
        box_width = 3
        for i in range(box_width):
            draw.rectangle(
                [x1 - i, y1 - i, x2 + i, y2 + i],
                outline=color,
            )

        # Draw label background
        try:
            bbox = draw.textbbox((0, 0), label_text, font=small_font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
        except AttributeError:
            text_w, text_h = draw.textsize(label_text, font=small_font)

        label_y = max(0, y1 - text_h - 6)
        draw.rectangle(
            [x1, label_y, x1 + text_w + 8, label_y + text_h + 6],
            fill=color,
        )
        draw.text(
            (x1 + 4, label_y + 2),
            label_text,
            fill=(255, 255, 255),
            font=small_font,
        )

    return annotated
