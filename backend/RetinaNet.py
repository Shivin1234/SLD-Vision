"""
Model loading and inference module for SLD RetinaNet detection.
Uses the exact same architecture, class mapping, preprocessing, and post-processing
as the original training code (config.py, utils.py, dataset.py).
Supports dynamic checkpoint loading (10-class) and optional tiled inference.
"""

import time
from pathlib import Path
from functools import partial
from typing import Dict, List, Any, Optional

import numpy as np
import torch
import torch.nn as nn
from torchvision.models.detection import (
    retinanet_resnet50_fpn_v2,
    RetinaNet_ResNet50_FPN_V2_Weights,
)
from torchvision.models.detection.retinanet import RetinaNetClassificationHead
from torchvision.ops import batched_nms
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
    Load trained RetinaNet checkpoint and infer its class count from the weights.
    Supports checkpoints containing model_state_dict and optional class metadata.
    """
    path = Path(checkpoint_path)
    if not path.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {path}")

    checkpoint = torch.load(path, map_location=device, weights_only=False)

    if "model_state_dict" not in checkpoint:
        raise KeyError(f"Checkpoint at {path} does not contain 'model_state_dict'.")

    state_dict = checkpoint["model_state_dict"]
    weight_key = "head.classification_head.cls_logits.weight"

    if weight_key in state_dict:
        total_out = state_dict[weight_key].shape[0]
        # RetinaNet output channels = number of anchors * number of classes.
        ckpt_classes = total_out // 9
    else:
        ckpt_classes = checkpoint.get("num_classes", NUM_CLASSES)

    model = build_model(num_classes=ckpt_classes, pretrained=False)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    raw_class_names = checkpoint.get("class_names")
    if raw_class_names:
        model_class_names = {int(k): v for k, v in raw_class_names.items()}
    else:
        model_class_names = CLASS_NAMES

    model.class_names = model_class_names
    model.class_colors = {
        label_int: SYMBOL_COLORS.get(name, (200, 200, 200))
        for label_int, name in model_class_names.items()
    }
    model.num_classes = ckpt_classes

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
    The model's own torchvision transform handles its configured resizing.
    """
    img_rgb = pil_image.convert("RGB")
    return to_tensor(img_rgb)


def run_inference(
    model: nn.Module,
    pil_image: Image.Image,
    device: torch.device,
    confidence_threshold: float = 0.25,
    use_tiling: bool = True,
    tile_size: int = 728,
    overlap: float = 0.20,
    nms_threshold: float = 0.50,
) -> Dict[str, Any]:
    """
    Run RetinaNet inference either on the whole image or on overlapping tiles.

    Tiling is useful for large SLD drawings containing small symbols. All returned
    bounding boxes use the original image coordinate system. Existing output keys
    are retained; tiling_info has additional settings.
    """
    image = pil_image.convert("RGB")
    img_width, img_height = image.size

    class_names = getattr(model, "class_names", CLASS_NAMES)
    class_colors = getattr(model, "class_colors", CLASS_COLORS)

    def tile_positions(length: int, size: int, step: int) -> List[int]:
        if length <= size:
            return [0]
        positions = list(range(0, length - size + 1, step))
        last_position = length - size
        if not positions or positions[-1] != last_position:
            positions.append(last_position)
        return positions

    if use_tiling:
        if tile_size <= 0:
            raise ValueError("tile_size must be greater than zero.")
        if not 0 <= overlap < 1:
            raise ValueError("overlap must be >= 0 and < 1.")
        step = max(1, int(tile_size * (1 - overlap)))
        x_positions = tile_positions(img_width, tile_size, step)
        y_positions = tile_positions(img_height, tile_size, step)
    else:
        x_positions = [0]
        y_positions = [0]

    all_boxes = []
    all_scores = []
    all_labels = []

    start_time = time.perf_counter()

    with torch.inference_mode():
        for y in y_positions:
            for x in x_positions:
                x2 = min(x + tile_size, img_width) if use_tiling else img_width
                y2 = min(y + tile_size, img_height) if use_tiling else img_height

                # When tiling is disabled, use the entire image.
                if not use_tiling:
                    x, y = 0, 0

                tile = image.crop((x, y, x2, y2))
                image_tensor = preprocess_image(tile).to(device)
                prediction = model([image_tensor])[0]

                boxes = prediction["boxes"].detach().cpu()
                scores = prediction["scores"].detach().cpu()
                labels = prediction["labels"].detach().cpu()

                keep = scores >= confidence_threshold
                boxes = boxes[keep]
                scores = scores[keep]
                labels = labels[keep]

                if boxes.numel() == 0:
                    continue

                # Shift tile-relative boxes into full-image coordinates.
                boxes[:, [0, 2]] += x
                boxes[:, [1, 3]] += y

                valid = (
                    (boxes[:, 2] > boxes[:, 0]) &
                    (boxes[:, 3] > boxes[:, 1])
                )
                known = torch.tensor(
                    [int(label) in class_names for label in labels],
                    dtype=torch.bool,
                )
                valid = valid & known

                boxes = boxes[valid]
                scores = scores[valid]
                labels = labels[valid]

                if boxes.numel() > 0:
                    all_boxes.append(boxes)
                    all_scores.append(scores)
                    all_labels.append(labels)

    inference_time_ms = (time.perf_counter() - start_time) * 1000.0

    detections: List[Dict[str, Any]] = []
    class_counts: Dict[str, int] = {}

    if all_boxes:
        boxes = torch.cat(all_boxes, dim=0)
        scores = torch.cat(all_scores, dim=0)
        labels = torch.cat(all_labels, dim=0)

        keep_indices = batched_nms(
            boxes,
            scores,
            labels,
            nms_threshold,
        )

        for idx in keep_indices.tolist():
            x1, y1, x2, y2 = boxes[idx].tolist()
            score = float(scores[idx])
            label_int = int(labels[idx])

            class_name = class_names[label_int]
            color = class_colors.get(label_int, (200, 200, 200))

            detections.append({
                "bbox": [
                    round(x1, 2),
                    round(y1, 2),
                    round(x2, 2),
                    round(y2, 2),
                ],
                "class_name": class_name,
                "class_id": label_int,
                "confidence": round(score, 4),
                "color": list(color),
            })

            class_counts[class_name] = class_counts.get(class_name, 0) + 1

    detections.sort(key=lambda det: det["confidence"], reverse=True)

    return {
        "detections": detections,
        "total_detections": len(detections),
        "class_counts": class_counts,
        "inference_time_ms": round(inference_time_ms, 2),
        "image_size": {
            "width": img_width,
            "height": img_height,
        },
        "tiling_info": {
            "enabled": use_tiling,
            "tile_size": tile_size if use_tiling else None,
            "overlap": overlap if use_tiling else None,
            "tiles_processed": len(x_positions) * len(y_positions),
        },
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

    # Optional: draw subtle tile boundaries if provided.
    if tile_grid:
        for tile in tile_grid:
            draw.rectangle(
                [
                    tile["xmin"],
                    tile["ymin"],
                    tile["xmax"],
                    tile["ymax"],
                ],
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

        # Draw bounding box.
        box_width = 3
        for i in range(box_width):
            draw.rectangle(
                [x1 - i, y1 - i, x2 + i, y2 + i],
                outline=color,
            )

        # Draw label background.
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

