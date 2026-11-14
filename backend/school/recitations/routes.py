import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Literal
from uuid import uuid4

from bson import BSON
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from school.core.database import db, raw_db
from school.core.services import ensure_student_access, now_iso, require_permission


router = APIRouter()
# First and last verse pages from Quran Foundation's Madani Mushaf layout.
JUZ = json.loads(Path(__file__).with_name("madani_pages.json").read_text(encoding="utf-8"))
MUSHAF = "Madani Mushaf (Hafs)"
read_sessions = require_permission("recitations.view")
write_sessions = require_permission("recitations.create")
publish_sessions = require_permission("recitations.publish")
configure = require_permission("recitations.configure")


def invalid(key):
    raise HTTPException(422, f"recitation.{key}")


class Named(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value):
        if not value.strip():
            raise ValueError("Title is required")
        return value.strip()


class Book(Named):
    pageCount: int = Field(ge=1, le=5000)


class MistakeType(Named):
    deduction: Decimal = Field(ge=0, le=100, decimal_places=2)


class Rating(Named):
    minimum: Decimal = Field(ge=0, le=100, decimal_places=2)


class Settings(BaseModel):
    books: list[Book] = Field(default_factory=list, max_length=100)
    mistakes: list[MistakeType] = Field(default_factory=list, max_length=100)
    ratings: list[Rating] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def check_rules(self):
        for items in (self.books, self.mistakes, self.ratings):
            if len({item.id for item in items}) != len(items) or len({item.title.casefold() for item in items}) != len(items):
                raise ValueError("Names and IDs must be unique")
        starts = {item.minimum for item in self.ratings}
        if 0 not in starts or len(starts) != len(self.ratings):
            raise ValueError("Rating bands must start at zero and have distinct thresholds")
        return self


class Mistake(BaseModel):
    typeId: str = Field(max_length=80)
    word: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=500)


class Page(BaseModel):
    page: int = Field(ge=1, le=5000)
    base: Decimal = Field(default=Decimal(100), ge=0, le=100, decimal_places=2)
    reason: str = Field(default="", max_length=500)
    mistakes: list[Mistake] = Field(default_factory=list, max_length=100)


class Session(BaseModel):
    settingsVersion: str = Field(max_length=80)
    source: Literal["quran", "book"]
    bookId: str | None = Field(default=None, max_length=80)
    startJuz: int | None = Field(default=None, ge=1, le=30)
    endJuz: int | None = Field(default=None, ge=1, le=30)
    startPage: int = Field(ge=1, le=5000)
    endPage: int = Field(ge=1, le=5000)
    pages: list[Page] = Field(min_length=1, max_length=5000)
    note: str = Field(default="", max_length=2000)


class Publication(BaseModel):
    published: bool


async def branch_settings(current):
    return await raw_db.recitation_settings.find_one({"_id": current["branchId"]}, {"_id": 0, "branchId": 0}) or {
        "version": "", "books": [], "mistakes": [], "ratings": [],
    }


def settings_payload(settings):
    return {**settings, "juz": JUZ, "mushaf": MUSHAF}


@router.get("/recitations/settings")
async def get_settings(current=Depends(configure)):
    return settings_payload(await branch_settings(current))


@router.put("/recitations/settings")
async def put_settings(body: Settings, current=Depends(configure)):
    settings = {**body.model_dump(mode="json"), "version": uuid4().hex}
    await raw_db.recitation_settings.update_one(
        {"_id": current["branchId"]}, {"$set": {**settings, "branchId": current["branchId"]}}, upsert=True,
    )
    return settings_payload(settings)


@router.get("/students/{sid}/recitations/options")
async def options(sid: str, current=Depends(write_sessions)):
    await ensure_student_access(sid, current)
    return settings_payload(await branch_settings(current))


def score_session(body, settings):
    if body.settingsVersion != settings["version"] or not settings["ratings"]:
        raise HTTPException(409, "recitation.settingsChanged")
    first, last = body.startPage, body.endPage
    if first > last or [page.page for page in body.pages] != list(range(first, last + 1)):
        invalid("invalidRange")
    if body.source == "quran" and body.startJuz and body.endJuz and body.startJuz <= body.endJuz and not body.bookId:
        for juz, page in ((body.startJuz, first), (body.endJuz, last)):
            bounds = JUZ[juz - 1]
            if not bounds["start"] <= page <= bounds["end"]:
                invalid("invalidRange")
        book = None
    elif body.source == "book" and not body.startJuz and not body.endJuz:
        book = next((book for book in settings["books"] if book["id"] == body.bookId), None)
        if not book or last > book["pageCount"]:
            invalid("invalidRange")
    else:
        invalid("invalidRange")
    types = {item["id"]: item for item in settings["mistakes"]}
    pages = []
    total = Decimal(0)
    for page in body.pages:
        if page.base < 100 and not page.reason.strip():
            invalid("reasonRequired")
        mistakes = []
        deductions = Decimal(0)
        for entry in page.mistakes:
            rule = types.get(entry.typeId)
            if not rule or not entry.word.strip():
                invalid("invalidMistake")
            points = Decimal(rule["deduction"])
            deductions += points
            mistakes.append({"type": rule["title"], "deduction": float(points),
                             "word": entry.word.strip(), "note": entry.note.strip()})
        score = max(Decimal(0), page.base - deductions)
        total += score
        pages.append({"page": page.page, "base": float(page.base), "score": float(score),
                      "reason": page.reason.strip(), "mistakes": mistakes})
    average = (total / len(pages)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rating = max((item for item in settings["ratings"] if Decimal(item["minimum"]) <= average),
                 key=lambda item: Decimal(item["minimum"]))
    return {
        "source": body.source, "title": book["title"] if book else MUSHAF,
        "book": book, "startJuz": body.startJuz, "endJuz": body.endJuz,
        "startPage": first, "endPage": last, "pages": pages, "score": float(average),
        "rating": rating["title"], "note": body.note.strip(),
        "rules": {"version": settings["version"], "ratings": settings["ratings"], "mistakes": settings["mistakes"]},
    }


@router.post("/students/{sid}/recitations")
async def create_session(sid: str, body: Session, current=Depends(write_sessions)):
    await ensure_student_access(sid, current)
    doc = {**score_session(body, await branch_settings(current)), "id": uuid4().hex,
           "studentId": sid, "createdAt": now_iso(), "createdBy": current["name"], "published": False}
    if len(BSON.encode(doc)) > 2 * 1024 * 1024:
        invalid("sessionTooLarge")
    await db.recitations.insert_one(doc)
    return {key: value for key, value in doc.items() if key != "_id"}


@router.get("/students/{sid}/recitations")
async def list_sessions(sid: str, skip: int = Query(0, ge=0), current=Depends(read_sessions)):
    await ensure_student_access(sid, current)
    records = await db.recitations.find({"studentId": sid}, {"_id": 0, "rules": 0}).sort(
        [("createdAt", -1), ("id", -1)],
    ).skip(skip).limit(11).to_list(11)
    return {"items": records[:10], "hasMore": len(records) > 10}


@router.put("/students/{sid}/recitations/{session_id}/publication")
async def publication(sid: str, session_id: str, body: Publication, current=Depends(publish_sessions)):
    await ensure_student_access(sid, current)
    result = await db.recitations.update_one(
        {"studentId": sid, "id": session_id},
        {"$set": {"published": body.published, "publicationChangedAt": now_iso(), "publicationChangedBy": current["id"]}},
    )
    if not result.matched_count:
        raise HTTPException(404, "recitation.notFound")
    return body.model_dump()


PARENT_FIELDS = {field: 1 for field in (
    "id", "source", "title", "startJuz", "endJuz", "startPage", "endPage", "pages", "score", "rating", "note", "createdAt",
)}


async def parent_sessions(student_id, branch_id):
    return await raw_db.recitations.find(
        {"studentId": student_id, "branchId": branch_id, "published": True},
        {"_id": 0, **PARENT_FIELDS},
    ).sort([("createdAt", -1), ("id", -1)]).limit(10).to_list(10)
