import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from school.core.database import db
from school.core.services import (
    ensure_grade_scope,
    ensure_student_access,
    grade_scope,
    now_iso,
    require_permission,
)
from school.grades.schemas import GradeIn, GradeSettingsIn
from school.grades.services import get_grade_settings


router = APIRouter()


@router.get("/settings/grades")
async def read_grade_settings(current=Depends(require_permission("grades.view"))):
    return await get_grade_settings()


@router.put("/settings/grades")
async def update_grade_settings(body: GradeSettingsIn,
                                current=Depends(require_permission("grades.accept"))):
    doc = {"id": "grades", "accepting": body.accepting, "updatedAt": now_iso(), "updatedBy": current["id"]}
    await db.settings.update_one({"id": "grades"}, {"$set": doc}, upsert=True)
    return {k: v for k, v in doc.items() if k != "updatedBy"}


@router.get("/grades")
async def list_grades(academicYear: Optional[str] = None, period: Optional[str] = None,
                      classId: Optional[str] = None, subjectId: Optional[str] = None,
                      studentId: Optional[str] = None,
                      current=Depends(require_permission("grades.view"))):
    allowed = await grade_scope(current)
    q = {}
    if academicYear: q["academicYear"] = academicYear
    if period: q["period"] = period
    if classId: q["classId"] = classId
    if subjectId: q["subjectId"] = subjectId
    if studentId: q["studentId"] = studentId
    if allowed is not None:
        q["$or"] = [{"classId": c, "subjectId": s} for c, s in allowed]
    docs = await db.grades.find(q, {"_id": 0}).sort("updatedAt", -1).to_list(10000)
    if allowed is not None:
        docs = [doc for doc in docs if (doc.get("classId"), doc.get("subjectId")) in allowed]
    for doc in docs:
        student = await db.students.find_one({"id": doc.get("studentId")}, {"_id": 0, "student.fullName": 1, "code": 1})
        subject = await db.subjects.find_one({"id": doc.get("subjectId")}, {"_id": 0, "name": 1})
        cls = await db.classes.find_one({"id": doc.get("classId")}, {"_id": 0, "name": 1, "section": 1})
        doc["studentName"] = (student.get("student") or {}).get("fullName") if student else "—"
        doc["studentCode"] = student.get("code") if student else None
        doc["subjectName"] = subject.get("name") if subject else "—"
        doc["className"] = f'{cls.get("name")} {cls.get("section") or ""}'.strip() if cls else "—"
    return docs


@router.post("/grades")
async def create_grade(body: GradeIn, current=Depends(require_permission("grades.create"))):
    if not (0 <= body.score <= 100): raise HTTPException(400, "الدرجة يجب أن تكون بين 0 و100")
    settings = await get_grade_settings()
    if not settings.get("accepting"): raise HTTPException(403, "فترة قبول الدرجات غير مفعلة")
    student = await ensure_student_access(body.studentId, current)
    if student.get("currentClassId") != body.classId: raise HTTPException(400, "الطالب ليس في هذا الصف")
    await ensure_grade_scope(body.classId, body.subjectId, current)
    if await db.grades.find_one({"studentId": body.studentId, "classId": body.classId,
                                 "subjectId": body.subjectId, "academicYear": body.academicYear,
                                 "period": body.period}):
        raise HTTPException(400, "الدرجة موجودة مسبقاً")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "createdBy": current["id"],
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.grades.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/grades/{grade_id}")
async def update_grade(grade_id: str, body: GradeIn,
                       current=Depends(require_permission("grades.edit"))):
    if not (0 <= body.score <= 100): raise HTTPException(400, "الدرجة يجب أن تكون بين 0 و100")
    settings = await get_grade_settings()
    if not settings.get("accepting"): raise HTTPException(403, "فترة قبول الدرجات غير مفعلة")
    existing = await db.grades.find_one({"id": grade_id})
    if not existing: raise HTTPException(404, "غير موجود")
    await ensure_student_access(body.studentId, current)
    await ensure_grade_scope(body.classId, body.subjectId, current)
    if body.studentId != existing.get("studentId") or body.classId != existing.get("classId") or body.subjectId != existing.get("subjectId"):
        raise HTTPException(400, "لا يمكن تغيير الطالب أو الصف أو المادة")
    await db.grades.update_one({"id": grade_id}, {"$set": {"score": body.score, "notes": body.notes or "", "updatedAt": now_iso(), "updatedBy": current["id"]}})
    return await db.grades.find_one({"id": grade_id}, {"_id": 0})
