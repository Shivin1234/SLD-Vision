import os
import sys
import traceback

# Ensure rtdetrv2_pytorch parent directory is in python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
REPO_SRC_DIR = os.path.join(PARENT_DIR, "rtdetrv2_pytorch")
if REPO_SRC_DIR not in sys.path:
    sys.path.insert(0, REPO_SRC_DIR)

import torch
import torch.nn as nn
import torchvision.transforms as T
from torchvision.models.detection import fasterrcnn_resnet50_fpn
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.transforms.functional import to_tensor
from torchvision.ops import batched_nms
from PIL import Image

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
NUM_CLASSES = 11

SHORT_NAMES = {
    0: "SLD", 
    1: "CB", 
    2: "CT", 
    3: "D-ELR", 
    4: "ELR", 
    5: "HRC", 
    6: "ISO", 
    7: "PIL", 
    8: "TOU", 
    9: "TDR", 
    10: "ZCT"
}

CLASS_NAMES = {
    0: "SLD-ANNOTATION",
    1: "CIRCUIT BREAKER", 
    2: "CURRENT TRANSFORMER", 
    3: "DIGITAL EARTH LEAKAGE RELAY", 
    4: "EARTH LEAKAGE RELAY", 
    5: "HRC FUSE WITH BLOWN FUSE INDICATOR", 
    6: "ISOLATOR", 
    7: "PHASE INDICATOR LIGHTS", 
    8: "SINGLE PHASE UNFUSED TAP OFF UNIT", 
    9: "TIME DELAY RELAY", 
    10: "ZERO PHASE SEQUENCE CURRENT TRANSFORMER"
}

# -------------------------------------------------------------
# 1. RT-DETRv2 LOADER & TILED INFERENCE (Untouched & Exact)
# -------------------------------------------------------------
class RTDETRWrapper(nn.Module):
    def __init__(self):
        super().__init__()
        ckpt_path = os.path.join(CURRENT_DIR, "best.pth")
        cfg_path = os.path.join(CURRENT_DIR, "config_used.yml")
        
        assert os.path.exists(ckpt_path), f"Weight file {ckpt_path} not found!"
        assert os.path.exists(cfg_path), f"Config file {cfg_path} not found!"

        try:
            from src.core import YAMLConfig  # type: ignore
        except ImportError:
            from rtdetrv2_pytorch.src.core import YAMLConfig  # type: ignore

        self.cfg = YAMLConfig(cfg_path)
        
        ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        state = ckpt["ema"]["module"] if ckpt.get("ema") is not None else ckpt["model"]
        self.cfg.model.load_state_dict(state)

        self.model = self.cfg.model.deploy()
        self.postprocessor = self.cfg.postprocessor.deploy()

    def forward(self, images, orig_sizes):
        outputs = self.model(images)
        labels, boxes, scores = self.postprocessor(outputs, orig_sizes)
        return {"boxes": boxes, "scores": scores, "labels": labels}


def load_rtdetrv2():
    print("Loading RT-DETRv2 model using YAMLConfig...")
    try:
        model = RTDETRWrapper().to(DEVICE).eval()
        print("RT-DETRv2 loaded successfully!")
        return model
    except Exception as e:
        print(f"❌ CRITICAL Error loading RT-DETRv2:")
        traceback.print_exc()
        return None


def run_rtdetrv2_inference(model, image: Image.Image, threshold: float = 0.3, zoom: float = 1.9, overlap: float = 0.25, nms_iou: float = 0.5):
    if model is None:
        return {"error": "RT-DETRv2 model is not loaded."}
        
    W, H = image.size
    IMG_SIZE = 800
    TILE = int(IMG_SIZE / zoom)
    STRIDE = int(TILE * (1 - overlap))
    edge_margin = 4
    tfm = T.Compose([T.Resize((800, 800)), T.ToTensor()])

    def starts(length, tile, stride):
        if length <= tile: return [0]
        s = list(range(0, length - tile + 1, stride))
        if s[-1] != length - tile: s.append(length - tile)
        return s

    xs = starts(W, TILE, STRIDE)
    ys = starts(H, TILE, STRIDE)

    all_l, all_b, all_s = [], [], []

    for y0 in ys:
        for x0 in xs:
            x1, y1 = min(x0 + TILE, W), min(y0 + TILE, H)
            tile = image.crop((x0, y0, x1, y1))
            
            w_t, h_t = tile.size
            x_tensor = tfm(tile).unsqueeze(0).to(DEVICE)
            sizes = torch.tensor([[w_t, h_t]]).to(DEVICE)
            
            with torch.no_grad():
                res = model(x_tensor, sizes)
            
            boxes = res["boxes"]
            scores = res["scores"]
            labels = res["labels"]

            t_boxes = boxes[0].cpu().tolist() if boxes.numel() > 0 else []
            t_scores = scores[0].cpu().tolist() if scores.numel() > 0 else []
            t_labels = labels[0].cpu().tolist() if labels.numel() > 0 else []

            tw, th = x1 - x0, y1 - y0
            for l, b, s in zip(t_labels, t_boxes, t_scores):
                if s < threshold: continue
                if x0 > 0 and b[0] < edge_margin: continue
                if y0 > 0 and b[1] < edge_margin: continue
                if x1 < W and b[2] > tw - edge_margin: continue
                if y1 < H and b[3] > th - edge_margin: continue
                
                class_id = int(l)
                all_l.append(class_id)
                all_s.append(float(s))
                all_b.append([b[0] + x0, b[1] + y0, b[2] + x0, b[3] + y0])

    if DEVICE.type == "cuda":
        torch.cuda.synchronize()

    if all_b:
        keep_nms = batched_nms(
            torch.tensor(all_b, dtype=torch.float32),
            torch.tensor(all_s, dtype=torch.float32),
            torch.tensor(all_l), nms_iou
        ).tolist()
        final_labels = [all_l[i] for i in keep_nms]
        final_boxes = [all_b[i] for i in keep_nms]
        final_scores = [all_s[i] for i in keep_nms]
    else:
        final_labels, final_boxes, final_scores = [], [], []

    detections = []
    for idx, (l, b, s) in enumerate(zip(final_labels, final_boxes, final_scores)):
        detections.append({
            "id": idx + 1,
            "class_id": l,
            "code": SHORT_NAMES.get(l, "UNK"),
            "name": CLASS_NAMES.get(l, "Unknown"),
            "confidence": round(s, 3),
            "box": [round(coord, 1) for coord in b]
        })
    return {"detections": detections}
