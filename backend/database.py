
"""MongoDB Atlas connection and persistence helpers for SLD Vision."""

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorGridFSBucket,
)

load_dotenv(Path(__file__).resolve().parent / ".env")

MONGO_DETAILS = os.getenv("MONGO_URI", "").strip()
DATABASE_NAME = os.getenv("MONGO_DATABASE", "sld_database").strip() or "sld_database"
COLLECTION_NAME = os.getenv("MONGO_COLLECTION", "bom_records").strip() or "bom_records"

client = None
database = None
bom_collection = None
image_bucket = None


# ============================================================
# DATABASE CONNECTION
# ============================================================

async def connect_database() -> None:
    """Connect to MongoDB Atlas and initialize GridFS."""
    global client, database, bom_collection, image_bucket

    if not MONGO_DETAILS:
        raise RuntimeError(
            "MONGO_URI is not configured. Check backend/.env."
        )

    if client is not None:
        await client.admin.command("ping")
        return

    candidate = AsyncIOMotorClient(
        MONGO_DETAILS,
        serverSelectionTimeoutMS=10000,
        connectTimeoutMS=10000,
        appname="SLD-Vision-API",
    )

    try:
        await candidate.admin.command("ping")
    except Exception:
        candidate.close()
        raise

    client = candidate
    database = client[DATABASE_NAME]
    bom_collection = database[COLLECTION_NAME]

    # GridFS stores original and annotated images.
    image_bucket = AsyncIOMotorGridFSBucket(database)


async def close_database() -> None:
    """Close the MongoDB connection."""
    global client, database, bom_collection, image_bucket

    if client is not None:
        client.close()

    client = None
    database = None
    bom_collection = None
    image_bucket = None


async def database_is_ready() -> bool:
    if client is None:
        return False

    try:
        await client.admin.command("ping")
        return True
    except Exception:
        return False


# ============================================================
# INTERNAL HELPERS
# ============================================================

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _valid_model_id(model_id: str) -> str:
    """Validate model IDs before using them in MongoDB field paths."""
    if not isinstance(model_id, str) or not re.fullmatch(
        r"[a-zA-Z0-9_-]+", model_id
    ):
        raise ValueError("Invalid model ID.")

    return model_id


def _class_count(detections: list) -> int:
    """Count distinct detected component classes."""
    names = {
        str(d.get("name") or d.get("class_name"))
        for d in detections
        if d.get("name") or d.get("class_name")
    }
    return len(names)


# ============================================================
# NEW: CREATE ONE ANALYSIS SESSION
# ============================================================

async def create_analysis_session(
    image_name: str,
    original_image_bytes: bytes,
    analysis_type: str,
    expected_model_ids: list[str],
    width: int,
    height: int,
) -> str:
    """
    Create one history document for a complete analysis session.

    The original image is uploaded once, even for comparison runs.
    """

    if bom_collection is None or image_bucket is None:
        await connect_database()

    if analysis_type not in ("single", "comparison"):
        raise ValueError("analysis_type must be 'single' or 'comparison'.")

    if not expected_model_ids:
        raise ValueError("At least one model ID is required.")

    model_ids = [_valid_model_id(model_id) for model_id in expected_model_ids]

    original_image_id = await image_bucket.upload_from_stream(
        f"{ObjectId()}_original",
        original_image_bytes,
        metadata={
            "content_type": "application/octet-stream",
            "original_filename": image_name,
            "image_type": "original",
        },
    )

    session = {
        "record_type": "analysis_session",
        "image_name": image_name,
        "analysis_type": analysis_type,
        "expected_model_ids": model_ids,
        "models": {},
        "original_image_id": original_image_id,
        "image_width": width,
        "image_height": height,
        "timestamp": _utc_now(),
        "status": "Processing",
    }

    try:
        result = await bom_collection.insert_one(session)
        return str(result.inserted_id)

    except Exception:
        try:
            await image_bucket.delete(original_image_id)
        except Exception:
            pass
        raise


# ============================================================
# NEW: SAVE ONE MODEL'S INFERENCE RESULT INTO A SESSION
# ============================================================

async def save_session_model_result(
    analysis_id: str,
    model_id: str,
    model_name: str,
    detections: list,
    total_components: int,
    annotated_image_bytes: bytes | None = None,
) -> None:
    """
    Save one model's detections and annotated image inside a session.

    Different models update different MongoDB fields, so concurrent
    comparison requests do not overwrite each other's results.
    """

    if bom_collection is None or image_bucket is None:
        await connect_database()

    if not ObjectId.is_valid(analysis_id):
        raise ValueError("Invalid analysis session ID.")

    model_id = _valid_model_id(model_id)
    session_object_id = ObjectId(analysis_id)

    session = await bom_collection.find_one(
        {
            "_id": session_object_id,
            "record_type": "analysis_session",
        },
        {"expected_model_ids": 1},
    )

    if not session:
        raise ValueError("Analysis session was not found.")

    if model_id not in session.get("expected_model_ids", []):
        raise ValueError("This model does not belong to the analysis session.")

    annotated_image_id = None

    if annotated_image_bytes:
        annotated_image_id = await image_bucket.upload_from_stream(
            f"{ObjectId()}_{model_id}_annotated.png",
            annotated_image_bytes,
            metadata={
                "content_type": "image/png",
                "model_id": model_id,
                "model_name": model_name,
                "analysis_id": analysis_id,
            },
        )

    model_data = {
        "model_id": model_id,
        "model_name": model_name,
        "detections": detections,
        "total": total_components,
        "class_count": _class_count(detections),
        "annotated_image_id": annotated_image_id,
        "saved_at": _utc_now(),
    }

    try:
        result = await bom_collection.update_one(
            {
                "_id": session_object_id,
                "record_type": "analysis_session",
            },
            {
                "$set": {
                    f"models.{model_id}": model_data,
                    "status": "Processing",
                }
            },
        )

        if result.matched_count == 0:
            raise ValueError("Analysis session was not found.")

    except Exception:
        if annotated_image_id is not None:
            try:
                await image_bucket.delete(annotated_image_id)
            except Exception:
                pass
        raise


# ============================================================
# NEW: SAVE FRONTEND-NORMALIZED RESULTS AND BOM
# ============================================================

async def finalize_analysis_session(
    analysis_id: str,
    models: dict[str, dict],
) -> None:
    """
    Save frontend-normalized model results, including BOM and latency.

    The annotated image IDs already stored by the inference requests
    are preserved.
    """

    if bom_collection is None:
        await connect_database()

    if not ObjectId.is_valid(analysis_id):
        raise ValueError("Invalid analysis session ID.")

    session_object_id = ObjectId(analysis_id)

    session = await bom_collection.find_one(
        {
            "_id": session_object_id,
            "record_type": "analysis_session",
        },
        {"expected_model_ids": 1, "models": 1},
    )

    if not session:
        raise ValueError("Analysis session was not found.")

    expected_ids = set(session.get("expected_model_ids", []))
    saved_ids = set(session.get("models", {}).keys())

    if not expected_ids.issubset(saved_ids):
        missing = sorted(expected_ids - saved_ids)
        raise ValueError(
            f"Cannot finalize session. Missing model results: {missing}"
        )

    if not isinstance(models, dict):
        raise ValueError("models must be a dictionary.")

    if set(models.keys()) != expected_ids:
        raise ValueError(
            "The submitted model IDs do not match the expected model IDs."
        )

    updates = {}

    for model_id, model_result in models.items():
        model_id = _valid_model_id(model_id)

        if not isinstance(model_result, dict):
            raise ValueError(f"Invalid result for model: {model_id}")

        # Store the normalized values used by the existing React UI.
        for field in (
            "model_name",
            "modelId",
            "total",
            "detections",
            "bom",
            "latency_ms",
            "width",
            "height",
        ):
            if field in model_result:
                updates[f"models.{model_id}.{field}"] = model_result[field]

    updates["status"] = "Completed"
    updates["completed_at"] = _utc_now()

    await bom_collection.update_one(
        {
            "_id": session_object_id,
            "record_type": "analysis_session",
        },
        {"$set": updates},
    )


# ============================================================
# NEW: FETCH A COMPLETE ANALYSIS SESSION
# ============================================================

async def get_analysis_session(analysis_id: str) -> dict | None:
    """Retrieve all saved data required to restore an analysis."""

    if bom_collection is None:
        await connect_database()

    if not ObjectId.is_valid(analysis_id):
        return None

    session = await bom_collection.find_one(
        {
            "_id": ObjectId(analysis_id),
            "record_type": "analysis_session",
        }
    )

    if not session:
        return None

    session["id"] = str(session.pop("_id"))

    # Remove the internal MongoDB ObjectId and provide an image URL.
    original_image_id = session.pop("original_image_id", None)

    session["original_image_url"] = (
        f"/api/history/{session['id']}/original-image"
        if original_image_id
        else None
    )

    # Remove internal GridFS ObjectIds from every model result.
    for model_id, model_result in session.get("models", {}).items():
        image_id = model_result.pop("annotated_image_id", None)

        model_result["annotated_image_url"] = (
            f"/api/history/{session['id']}/models/{model_id}/image"
            if image_id
            else None
        )

    return session


# ============================================================
# NEW: FETCH ORIGINAL IMAGE
# ============================================================

async def get_original_image(analysis_id: str) -> bytes | None:
    """Retrieve the original image for an analysis session."""

    if bom_collection is None or image_bucket is None:
        await connect_database()

    if not ObjectId.is_valid(analysis_id):
        return None

    session = await bom_collection.find_one(
        {
            "_id": ObjectId(analysis_id),
            "record_type": "analysis_session",
        },
        {"original_image_id": 1},
    )

    if not session or not session.get("original_image_id"):
        return None

    try:
        stream = await image_bucket.open_download_stream(
            session["original_image_id"]
        )
        return await stream.read()
    except Exception:
        return None


# ============================================================
# NEW: FETCH ANNOTATED IMAGE FOR A MODEL IN A SESSION
# ============================================================

async def get_session_model_image(
    analysis_id: str,
    model_id: str,
) -> bytes | None:
    """Retrieve one model's annotated PNG from a session."""

    if bom_collection is None or image_bucket is None:
        await connect_database()

    if not ObjectId.is_valid(analysis_id):
        return None

    try:
        model_id = _valid_model_id(model_id)
    except ValueError:
        return None

    session = await bom_collection.find_one(
        {
            "_id": ObjectId(analysis_id),
            "record_type": "analysis_session",
        },
        {f"models.{model_id}.annotated_image_id": 1},
    )

    if not session:
        return None

    model_data = session.get("models", {}).get(model_id, {})
    image_id = model_data.get("annotated_image_id")

    if image_id is None:
        return None

    try:
        stream = await image_bucket.open_download_stream(image_id)
        return await stream.read()
    except Exception:
        return None


# ============================================================
# HISTORY: NEW SESSIONS + OLD LEGACY RECORDS
# ============================================================

async def get_inference_history(limit: int = 100) -> list[dict]:
    """
    Fetch recent history.

    New analysis sessions appear as one row each.
    Old records remain visible as individual legacy rows.
    """

    if bom_collection is None:
        await connect_database()

    cursor = (
        bom_collection
        .find({})
        .sort("timestamp", -1)
        .limit(limit)
    )

    history = []

    async for record in cursor:
        record_id = str(record["_id"])

        # --------------------------------------------
        # NEW SESSION RECORD
        # --------------------------------------------
        if record.get("record_type") == "analysis_session":
            models = record.get("models", {})
            analysis_type = record.get("analysis_type", "single")

            if analysis_type == "comparison":
                model_name = "All 4 Models"
                total_components = None
                class_count = None
            else:
                model_id = (
                    record.get("expected_model_ids") or [None]
                )[0]
                model_data = models.get(model_id, {}) if model_id else {}

                model_name = model_data.get(
                    "model_name",
                    model_id or "—",
                )
                total_components = model_data.get("total")
                class_count = model_data.get("class_count")

            history.append({
                "id": record_id,
                "analysis_type": analysis_type,
                "file_name": record.get("image_name", "—"),
                "model_name": model_name,
                "total_components": total_components,
                "class_count": class_count,
                "created_at": (
                    record["timestamp"].isoformat()
                    if record.get("timestamp")
                    else None
                ),
                "status": record.get("status", "Processing"),
                "original_image_url": (
                    f"/api/history/{record_id}/original-image"
                    if record.get("original_image_id")
                    else None
                ),
            })

            continue

        # --------------------------------------------
        # LEGACY RECORD — KEEP EXISTING BEHAVIOR
        # --------------------------------------------
        detections = record.get("detections", []) or []

        history.append({
            "id": record_id,
            "file_name": record.get("image_name", "—"),
            "model_name": record.get("model_name", "—"),
            "total_components": record.get(
                "total_components", len(detections)
            ),
            "class_count": record.get(
                "class_count",
                _class_count(detections),
            ),
            "created_at": (
                record["timestamp"].isoformat()
                if record.get("timestamp")
                else None
            ),
            "status": "Saved",
            "annotated_image_url": (
                f"/api/history/{record_id}/image"
                if record.get("annotated_image_id")
                else None
            ),
        })

    return history


# ============================================================
# LEGACY: SAVE ONE INFERENCE RESULT
# Keep this for old API compatibility.
# ============================================================

async def save_inference_result(
    image_name: str,
    model_name: str,
    detections: list,
    total_components: int,
    annotated_image_bytes: bytes | None = None,
) -> str:
    """Save a legacy standalone inference record."""

    if bom_collection is None or image_bucket is None:
        await connect_database()

    image_id = None

    if annotated_image_bytes:
        image_id = await image_bucket.upload_from_stream(
            f"{ObjectId()}_annotated.png",
            annotated_image_bytes,
            metadata={
                "content_type": "image/png",
                "original_filename": image_name,
                "model_name": model_name,
            },
        )

    record: dict[str, Any] = {
        "image_name": image_name,
        "model_name": model_name,
        "timestamp": _utc_now(),
        "total_components": total_components,
        "class_count": _class_count(detections),
        "detections": detections,
        "annotated_image_id": image_id,
    }

    try:
        result = await bom_collection.insert_one(record)
        return str(result.inserted_id)

    except Exception:
        if image_id is not None:
            try:
                await image_bucket.delete(image_id)
            except Exception:
                pass
        raise


# ============================================================
# LEGACY: FETCH ONE ANNOTATED IMAGE
# ============================================================

async def get_annotated_image(record_id: str) -> bytes | None:
    """Retrieve the annotated PNG belonging to a legacy history record."""

    if bom_collection is None or image_bucket is None:
        await connect_database()

    if not ObjectId.is_valid(record_id):
        return None

    record = await bom_collection.find_one(
        {
            "_id": ObjectId(record_id),
            "record_type": {"$ne": "analysis_session"},
        },
        {"annotated_image_id": 1},
    )

    if not record:
        return None

    image_id = record.get("annotated_image_id")

    if image_id is None:
        return None

    try:
        stream = await image_bucket.open_download_stream(image_id)
        return await stream.read()
    except Exception:
        return None
