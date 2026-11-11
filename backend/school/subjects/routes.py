import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from school.core.database import db
from school.core.services import grade_scope, now_iso, require_permission
from school.subjects.schemas import ClassSubjectIn, SubjectIn, TeacherSubjectIn


router = APIRouter()


@router.get("/subjects")
async def list_subjects(status: Optional[str] = None,
                        current=Depends(require_permission("subjects.view"))):
    q = {} if status == "all" else {"status": status or {"$ne": "inactive"}}
    if current.get("teacherId"):
        assignments = await db.teacher_subject_assignments.find(
            {"teacherId": current["teacherId"]}, {"_id": 0, "subjectId": 1}
        ).to_list(5000)
        q["id"] = {"$in": [item["subjectId"] for item in assignments]}
    return await db.subjects.find(q, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/subjects")
async def create_subject(body: SubjectIn, current=Depends(require_permission("subjects.create"))):
    if not body.name.strip(): raise HTTPException(400, "اسم المادة مطلوب")
    if body.code and await db.subjects.find_one({"code": body.code.strip()}):
        raise HTTPException(400, "رمز المادة مستخدم")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "name": body.name.strip(),
           "code": (body.code or "").strip(), "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.subjects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/subjects/{subject_id}")
async def update_subject(subject_id: str, body: SubjectIn,
                         current=Depends(require_permission("subjects.update"))):
    if not body.name.strip(): raise HTTPException(400, "اسم المادة مطلوب")
    if not await db.subjects.find_one({"id": subject_id}): raise HTTPException(404, "غير موجود")
    if body.code and await db.subjects.find_one({"code": body.code.strip(), "id": {"$ne": subject_id}}):
        raise HTTPException(400, "رمز المادة مستخدم")
    await db.subjects.update_one({"id": subject_id}, {"$set": {
        **body.model_dump(), "name": body.name.strip(), "code": (body.code or "").strip(), "updatedAt": now_iso()
    }})
    return await db.subjects.find_one({"id": subject_id}, {"_id": 0})


@router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str, current=Depends(require_permission("subjects.delete"))):
    result = await db.subjects.update_one({"id": subject_id}, {"$set": {"status": "inactive", "updatedAt": now_iso()}})
    if not result.matched_count: raise HTTPException(404, "غير موجود")
    return {"ok": True}


@router.get("/teacher-subject-assignments")
async def list_teacher_subject_assignments(teacherId: Optional[str] = None,
                                           current=Depends(require_permission("subjects.view"))):
    if current.get("teacherId"):
        teacherId = current["teacherId"]
    q = {"teacherId": teacherId} if teacherId else {}
    return await db.teacher_subject_assignments.find(q, {"_id": 0}).to_list(5000)


@router.post("/teacher-subject-assignments")
async def create_teacher_subject_assignment(body: TeacherSubjectIn,
                                            current=Depends(require_permission("subjects.update"))):
    if not await db.teachers.find_one({"id": body.teacherId}): raise HTTPException(400, "المعلم غير موجود")
    if not await db.subjects.find_one({"id": body.subjectId, "status": {"$ne": "inactive"}}): raise HTTPException(400, "المادة غير موجودة")
    if await db.teacher_subject_assignments.find_one({"teacherId": body.teacherId, "subjectId": body.subjectId}):
        raise HTTPException(400, "الإسناد موجود مسبقاً")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "createdAt": now_iso()}
    await db.teacher_subject_assignments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/teacher-subject-assignments/{assignment_id}")
async def delete_teacher_subject_assignment(assignment_id: str,
                                            current=Depends(require_permission("subjects.update"))):
    result = await db.teacher_subject_assignments.delete_one({"id": assignment_id})
    if not result.deleted_count: raise HTTPException(404, "غير موجود")
    return {"ok": True}


@router.get("/class-subject-assignments")
async def list_class_subject_assignments(classId: Optional[str] = None,
                                         current=Depends(require_permission("subjects.view"))):
    q = {"classId": classId} if classId else {}
    assignments = await db.class_subject_assignments.find(q, {"_id": 0}).to_list(5000)
    allowed = await grade_scope(current)
    if allowed is not None:
        assignments = [item for item in assignments if (item["classId"], item["subjectId"]) in allowed]
    return assignments


@router.post("/class-subject-assignments")
async def create_class_subject_assignment(body: ClassSubjectIn,
                                          current=Depends(require_permission("subjects.update"))):
    if not await db.classes.find_one({"id": body.classId}): raise HTTPException(400, "الصف غير موجود")
    if not await db.subjects.find_one({"id": body.subjectId, "status": {"$ne": "inactive"}}): raise HTTPException(400, "المادة غير موجودة")
    if await db.class_subject_assignments.find_one({"classId": body.classId, "subjectId": body.subjectId}):
        raise HTTPException(400, "المادة مسندة إلى الصف مسبقاً")
    teacher_ids = list(dict.fromkeys(body.teacherIds))
    for teacher_id in teacher_ids:
        if not await db.teachers.find_one({"id": teacher_id}): raise HTTPException(400, "المعلم غير موجود")
        if not await db.teacher_subject_assignments.find_one({"teacherId": teacher_id, "subjectId": body.subjectId}):
            raise HTTPException(400, "المعلم غير مخول لهذه المادة")
    doc = {"id": str(uuid.uuid4()), "classId": body.classId, "subjectId": body.subjectId,
           "teacherIds": teacher_ids, "createdAt": now_iso()}
    await db.class_subject_assignments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/class-subject-assignments/{assignment_id}")
async def update_class_subject_assignment(assignment_id: str, body: ClassSubjectIn,
                                          current=Depends(require_permission("subjects.update"))):
    existing = await db.class_subject_assignments.find_one({"id": assignment_id})
    if not existing: raise HTTPException(404, "غير موجود")
    if existing["classId"] != body.classId or existing["subjectId"] != body.subjectId:
        raise HTTPException(400, "لا يمكن تغيير الصف أو المادة")
    for teacher_id in body.teacherIds:
        if not await db.teacher_subject_assignments.find_one({"teacherId": teacher_id, "subjectId": body.subjectId}):
            raise HTTPException(400, "المعلم غير مخول لهذه المادة")
    await db.class_subject_assignments.update_one({"id": assignment_id}, {"$set": {"teacherIds": list(dict.fromkeys(body.teacherIds))}})
    return await db.class_subject_assignments.find_one({"id": assignment_id}, {"_id": 0})


@router.delete("/class-subject-assignments/{assignment_id}")
async def delete_class_subject_assignment(assignment_id: str,
                                          current=Depends(require_permission("subjects.update"))):
    result = await db.class_subject_assignments.delete_one({"id": assignment_id})
    if not result.deleted_count: raise HTTPException(404, "غير موجود")
    return {"ok": True}
