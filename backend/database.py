"""MongoDB Atlas connection and persistence helpers for SLD Vision.

Set MONGO_URI in backend/.env for local development or in the deployment
provider's environment settings. Never put this URI in frontend code.
"""
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load the backend-local .env when running locally. Deployment platforms should
# supply environment variables directly.
load_dotenv(Path(__file__).resolve().parent / ".env")

MONGO_DETAILS = os.getenv("MONGO_URI", "").strip()
DATABASE_NAME = os.getenv("MONGO_DATABASE", "sld_database").strip() or "sld_database"
COLLECTION_NAME = os.getenv("MONGO_COLLECTION", "bom_records").strip() or "bom_records"

client: AsyncIOMotorClient | None = None
database = None
bom_collection = None


async def connect_database() -> None:
    """Create and verify the MongoDB connection. Safe to call more than once."""
    global client, database, bom_collection

    if not MONGO_DETAILS:
        raise RuntimeError(
            "MONGO_URI is not configured. Add it to backend/.env for local "
            "development or to the backend host's environment variables."
        )

    if client is not None:
        # Verify an existing client before reusing it.
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


async def close_database() -> None:
    """Close the MongoDB client during application shutdown."""
    global client, database, bom_collection
    if client is not None:
        client.close()
    client = None
    database = None
    bom_collection = None


async def database_is_ready() -> bool:
    """Return True only when Atlas is reachable and the client is initialized."""
    if client is None:
        return False
    try:
        await client.admin.command("ping")
        return True
    except Exception:
        return False


async def save_inference_result(
    image_name: str,
    model_name: str,
    detections: list,
    total_components: int,
) -> str:
    """Persist actual inference results and return the inserted document ID."""
    if bom_collection is None:
        await connect_database()

    record: dict[str, Any] = {
        "image_name": image_name,
        "model_name": model_name,
        "timestamp": datetime.now(timezone.utc),
        "total_components": total_components,
        "detections": detections,
    }
    result = await bom_collection.insert_one(record)
    return str(result.inserted_id)

