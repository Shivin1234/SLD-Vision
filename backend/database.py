import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_DETAILS = os.getenv("MONGO_URI", "mongodb://localhost:27017")

client = AsyncIOMotorClient(MONGO_DETAILS)
database = client.sld_database
bom_collection = database.get_collection("bom_records")


async def save_inference_result(
    image_name: str, 
    model_name: str, 
    detections: list, 
    total_components: int
):
    """Saves inference results and BOM records to MongoDB."""
    record = {
        "image_name": image_name,
        "model_name": model_name,
        "timestamp": datetime.utcnow(),
        "total_components": total_components,
        "detections": detections
    }
    
    result = await bom_collection.insert_one(record)
    return str(result.inserted_id)