import re
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from school.core.database import raw_db
from school.core.services import now_iso, require_permission


router = APIRouter(prefix="/grade-announcements")
staff = require_permission("announcements.manage")
configure_groups = require_permission("announcements.configure")

Audience = Literal["combined", "girls", "boys"]
INVITE_LINK = re.compile(r"https://chat\.whatsapp\.com/[A-Za-z0-9]{10,64}/?")


class GroupIn(BaseModel):
    url: str = Field(max_length=512)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value):
        value = value.strip()
        # WhatsApp sometimes adds a share-tracking query to copied links.
        url = value.split("?", 1)[0].split("#", 1)[0]
        if url and not INVITE_LINK.fullmatch(url):
            raise ValueError("Expected a WhatsApp group invite link")
        return url


class AnnouncementIn(BaseModel):
    id: uuid.UUID
    grade: int = Field(ge=1, le=9)
    audiences: list[Audience] = Field(min_length=1, max_length=2)
    message: str = Field(min_length=1, max_length=4000)


def valid_audiences(grade):
    return {"combined"} if grade <= 2 else {"girls", "boys"}


@router.get("/groups")
async def list_groups(current=Depends(staff)):
    return await raw_db.announcement_groups.find(
        {"branchId": current["branchId"]}, {"_id": 0, "grade": 1, "audience": 1, "url": 1},
    ).to_list(16)


@router.put("/groups/{grade}/{audience}")
async def save_group(grade: int, audience: Audience, body: GroupIn, current=Depends(configure_groups)):
    if grade not in range(1, 10) or audience not in valid_audiences(grade):
        raise HTTPException(400, "Invalid grade or audience")
    branch = current["branchId"]
    key = {"_id": f"{branch}:{grade}:{audience}"}
    if body.url:
        await raw_db.announcement_groups.update_one(
            key, {"$set": {"branchId": branch, "grade": grade, "audience": audience, "url": body.url}},
            upsert=True,
        )
    else:
        await raw_db.announcement_groups.delete_one(key)
    return {"grade": grade, "audience": audience, "url": body.url}


@router.get("")
async def history(grade: int = Query(ge=1, le=9), skip: int = Query(0, ge=0),
                  current=Depends(staff)):
    rows = await raw_db.grade_announcements.find(
        {"branchId": current["branchId"], "grade": grade}, {"_id": 0, "branchId": 0},
    ).sort([("createdAt", -1), ("id", -1)]).skip(skip).limit(21).to_list(21)
    return {"items": rows[:20], "hasMore": len(rows) > 20}


@router.post("")
async def create_announcement(body: AnnouncementIn, current=Depends(staff)):
    message = body.message.strip()
    audiences = sorted(set(body.audiences))
    if not message or len(audiences) != len(body.audiences) or not set(audiences) <= valid_audiences(body.grade):
        raise HTTPException(400, "Invalid announcement")
    branch = current["branchId"]
    announcement_id = str(body.id)
    key = {"_id": f"{branch}:{announcement_id}"}
    groups = await raw_db.announcement_groups.find(
        {"branchId": branch, "grade": body.grade, "audience": {"$in": audiences}},
        {"audience": 1},
    ).to_list(2)
    if len(groups) != len(audiences):
        raise HTTPException(409, "Configure a group link for each selected audience")
    await raw_db.grade_announcements.update_one(
        key, {"$setOnInsert": {
            "id": announcement_id, "branchId": branch, "grade": body.grade,
            "message": message, "createdAt": now_iso(), "createdBy": current["name"],
            "groups": [{"audience": audience, "sentAt": None, "sentBy": None} for audience in audiences],
        }},
        upsert=True,
    )
    return await raw_db.grade_announcements.find_one(key, {"_id": 0, "branchId": 0})


@router.put("/{announcement_id}/groups/{audience}/sent")
async def mark_sent(announcement_id: uuid.UUID, audience: Audience, current=Depends(staff)):
    branch = current["branchId"]
    key = {"_id": f"{branch}:{announcement_id}", "branchId": branch}
    # Repeated clicks keep the original sender and timestamp.
    await raw_db.grade_announcements.update_one(
        {**key, "groups": {"$elemMatch": {"audience": audience, "sentAt": None}}},
        {"$set": {"groups.$.sentAt": now_iso(), "groups.$.sentBy": current["name"]}},
    )
    record = await raw_db.grade_announcements.find_one(
        {**key, "groups.audience": audience}, {"_id": 0, "branchId": 0},
    )
    if not record:
        raise HTTPException(404, "Announcement group not found")
    return record
