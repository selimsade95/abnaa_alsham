import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from school.core.database import JWT_SECRET, raw_db


def _digest(value):
    return hmac.new(JWT_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


async def limit_attempts(request, purpose, maximum):
    now = datetime.now(timezone.utc)
    window = int(now.timestamp()) // 900
    client = request.client.host if request.client else "unknown"
    key = _digest(f"attempt:{purpose}:{window}:{client}")
    update = {"$inc": {"count": 1}, "$setOnInsert": {"expiresAt": now + timedelta(minutes=30)}}
    attempts = raw_db.access_attempts
    try:
        entry = await attempts.find_one_and_update(
            {"_id": key}, update, upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        entry = await attempts.find_one_and_update(
            {"_id": key}, {"$inc": {"count": 1}}, return_document=ReturnDocument.AFTER,
        )
    if entry["count"] > maximum:
        raise HTTPException(429, "محاولات كثيرة. حاول مرة أخرى بعد قليل.", headers={"Retry-After": str(900 - int(now.timestamp()) % 900)})


