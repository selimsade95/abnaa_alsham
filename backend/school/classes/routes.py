import math
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from school.classes.schemas import ClassIn, ClassPromotionIn
from school.core.csv_upload import _read_csv_rows
from school.core.database import db
from school.core.schemas import DeactivationIn
from school.core.services import (
    allowed_class_ids,
    ensure_class_access,
    ensure_student_access,
    generate_code,
    now_iso,
    require_permission,
)


router = APIRouter()


async def _class_enrich(c: dict) -> dict:
    teacher_ids = c.get("teacherIds") or ([c["teacherId"]] if c.get("teacherId") else [])
    teachers = await db.teachers.find({"id": {"$in": teacher_ids}}, {"_id": 0, "id": 1, "fullName": 1, "code": 1}).to_list(100)
    teachers_by_id = {teacher["id"]: teacher for teacher in teachers}
    teacher_ids = [teacher_id for teacher_id in teacher_ids if teacher_id in teachers_by_id]
    teachers = [teachers_by_id[teacher_id] for teacher_id in teacher_ids]
    c["teacherIds"] = teacher_ids
    c["teacherNames"] = [t.get("fullName") for t in teachers]
    c["teacherName"] = ", ".join(c["teacherNames"]) or None
    c["teacherCode"] = ", ".join(t.get("code") for t in teachers if t.get("code")) or None
    c["studentCount"] = await db.students.count_documents({"currentClassId": c["id"]})
    return c


async def _enrich_classes(classes: list[dict]) -> list[dict]:
    if not classes:
        return classes
    teacher_ids = {
        teacher_id
        for class_doc in classes
        for teacher_id in (
            class_doc.get("teacherIds")
            or ([class_doc["teacherId"]] if class_doc.get("teacherId") else [])
        )
    }
    teachers = await db.teachers.find(
        {"id": {"$in": list(teacher_ids)}},
        {"_id": 0, "id": 1, "fullName": 1, "code": 1},
    ).to_list(len(teacher_ids))
    teachers_by_id = {teacher["id"]: teacher for teacher in teachers}
    class_ids = [class_doc["id"] for class_doc in classes]
    student_counts = await db.students.aggregate(
        [
            {"$match": {"currentClassId": {"$in": class_ids}}},
            {"$group": {"_id": "$currentClassId", "count": {"$sum": 1}}},
        ]
    ).to_list(len(class_ids))
    counts_by_class = {row["_id"]: row["count"] for row in student_counts}

    for class_doc in classes:
        class_teacher_ids = class_doc.get("teacherIds") or (
            [class_doc["teacherId"]] if class_doc.get("teacherId") else []
        )
        resolved_ids = [
            teacher_id for teacher_id in class_teacher_ids if teacher_id in teachers_by_id
        ]
        class_teachers = [teachers_by_id[teacher_id] for teacher_id in resolved_ids]
        class_doc["teacherIds"] = resolved_ids
        class_doc["teacherNames"] = [
            teacher.get("fullName") for teacher in class_teachers
        ]
        class_doc["teacherName"] = ", ".join(class_doc["teacherNames"]) or None
        class_doc["teacherCode"] = (
            ", ".join(
                teacher["code"] for teacher in class_teachers if teacher.get("code")
            )
            or None
        )
        class_doc["studentCount"] = counts_by_class.get(class_doc["id"], 0)
    return classes


@router.get("/classes")
async def list_classes(search: Optional[str] = None, grade: Optional[str] = None,
                       section: Optional[str] = None, academicYear: Optional[str] = None,
                       teacherId: Optional[str] = None, status: Optional[str] = None,
                       page: int = 1, limit: int = 50,
                       current=Depends(require_permission("classes.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    q = {} if status == "all" else {"status": status or {"$ne": "inactive"}}
    if grade: q["grade"] = grade
    if section: q["section"] = section
    if academicYear: q["academicYear"] = academicYear
    allowed = await allowed_class_ids(current)
    if allowed is not None:
        q["id"] = {"$in": allowed}
    elif teacherId:
        q["$or"] = [{"teacherIds": teacherId}, {"teacherId": teacherId}]
    if search:
        rx = {"$regex": search, "$options": "i"}
        q["$or"] = [{"name": rx}, {"code": rx}, {"grade": rx}, {"section": rx}, {"academicYear": rx}]
    total = await db.classes.count_documents(q)
    docs = await db.classes.find(q, {"_id": 0}).sort("createdAt", -1).skip((page-1)*limit).limit(limit).to_list(limit)
    await _enrich_classes(docs)
    return {"data": docs, "pagination": {"page": page, "limit": limit, "total": total, "totalPages": (total + limit - 1) // limit}}


@router.post("/classes/import")
async def import_classes(file: UploadFile = File(...), current=Depends(require_permission("classes.create"))):
    rows = await _read_csv_rows(file)
    required = {"name", "grade", "section", "academicYear", "capacity", "status", "notes"}
    if not rows or not required.issubset(rows[0].keys()):
        raise HTTPException(400, "قالب الصفوف غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        if not (row.get("name") or "").strip():
            raise HTTPException(400, f"اسم الصف مطلوب في الصف {index}")
        teacher_ids = [item.strip() for item in (row.get("teacherIds") or row.get("teacherId") or "").split(",") if item.strip()]
        for teacher_id in teacher_ids:
            if not await db.teachers.find_one({"id": teacher_id}):
                raise HTTPException(400, f"المعلم غير موجود في الصف {index}")
        try: capacity = int(row.get("capacity") or 0)
        except ValueError: raise HTTPException(400, f"السعة غير صحيحة في الصف {index}")
        code = await generate_code("classes")
        doc = {"id": str(uuid.uuid4()), "code": code, "name": row["name"].strip(),
               "grade": row.get("grade", "").strip(), "section": row.get("section", "").strip(),
               "academicYear": row.get("academicYear", "").strip(), "teacherIds": teacher_ids,
               "teacherId": teacher_ids[0] if teacher_ids else None,
               "capacity": capacity, "status": row.get("status", "active").strip() or "active",
               "notes": row.get("notes", "").strip(), "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.classes.insert_one(doc); created.append(doc["id"])
    return {"ok": True, "created": len(created)}


@router.get("/classes/{cid}")
async def get_class(cid: str, current=Depends(require_permission("classes.view"))):
    c = await ensure_class_access(cid, current)
    c.pop("_id", None)
    return await _class_enrich(c)


@router.post("/classes")
async def create_class(body: ClassIn, current=Depends(require_permission("classes.create"))):
    if not body.name.strip(): raise HTTPException(400, "الاسم مطلوب")
    code = await generate_code("classes")
    data = body.model_dump()
    teacher_ids = list(dict.fromkeys(data.get("teacherIds") or ([] if not data.get("teacherId") else [data["teacherId"]])))
    for teacher_id in teacher_ids:
        if not await db.teachers.find_one({"id": teacher_id}):
            raise HTTPException(400, "أحد المعلمين غير موجود")
    data["teacherIds"] = teacher_ids
    data["teacherId"] = teacher_ids[0] if teacher_ids else None
    doc = {"id": str(uuid.uuid4()), "code": code, **data,
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.classes.insert_one(doc)
    return await _class_enrich({k: v for k, v in doc.items() if k != "_id"})


@router.put("/classes/{cid}")
async def update_class(cid: str, body: ClassIn, current=Depends(require_permission("classes.update"))):
    await ensure_class_access(cid, current)
    upd = body.model_dump()
    upd["teacherIds"] = list(dict.fromkeys(upd.get("teacherIds") or ([] if not upd.get("teacherId") else [upd["teacherId"]])))
    for teacher_id in upd["teacherIds"]:
        if not await db.teachers.find_one({"id": teacher_id}):
            raise HTTPException(400, "أحد المعلمين غير موجود")
    upd["teacherId"] = upd["teacherIds"][0] if upd["teacherIds"] else None
    upd["updatedAt"] = now_iso()
    await db.classes.update_one({"id": cid}, {"$set": upd})
    return await _class_enrich(await db.classes.find_one({"id": cid}, {"_id": 0}))


@router.post("/classes/{source_id}/promote-students")
async def promote_class_students(
    source_id: str,
    body: ClassPromotionIn,
    current=Depends(require_permission("students.update")),
):
    source_class = await ensure_class_access(source_id, current)
    destination_class = await ensure_class_access(body.destinationClassId, current)
    if source_id == body.destinationClassId:
        raise HTTPException(400, "يجب اختيار صف مختلف للترفيع")
    if destination_class.get("status") != "active":
        raise HTTPException(400, "الصف الجديد غير نشط")
    if not body.students:
        raise HTTPException(400, "اختر طالباً واحداً على الأقل")
    student_ids = [selection.studentId for selection in body.students]
    if len(student_ids) != len(set(student_ids)):
        raise HTTPException(400, "لا يمكن تكرار الطالب في طلب الترفيع")

    students_to_move = []
    for selection in body.students:
        if not math.isfinite(selection.totalPayable) or selection.totalPayable < 0:
            raise HTTPException(400, "المستحق الجديد يجب أن يكون رقماً غير سالب")
        student = await ensure_student_access(selection.studentId, current)
        if student.get("currentClassId") != source_id:
            raise HTTPException(400, "أحد الطلاب لم يعد في الصف المحدد")
        if (student.get("student") or {}).get("status") == "inactive":
            raise HTTPException(400, "لا يمكن ترفيع طالب غير نشط")
        students_to_move.append((student, selection))

    timestamp = now_iso()
    source_name = source_class.get("name") or ""
    destination_name = destination_class.get("name") or ""
    moved = []
    for student, selection in students_to_move:
        fees = student.get("fees") or {}
        fees["totalPayable"] = float(selection.totalPayable)
        if destination_class.get("academicYear"):
            fees["academicYear"] = destination_class["academicYear"]
        await db.students.update_one(
            {"id": student["id"], "currentClassId": source_id},
            {"$set": {
                "currentClassId": body.destinationClassId,
                "student.previousClass": source_name,
                "student.newClass": destination_name,
                "fees": fees,
                "updatedAt": timestamp,
            }},
        )
        moved.append({"studentId": student["id"], "totalPayable": float(selection.totalPayable)})
    return {"ok": True, "moved": len(moved), "students": moved}


@router.delete("/classes/{cid}")
async def delete_class(cid: str, body: DeactivationIn, current=Depends(require_permission("classes.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    await ensure_class_access(cid, current)
    r = await db.classes.update_one(
        {"id": cid},
        {"$set": {"status": "inactive", "deactivatedAt": now_iso(),
                   "deactivationReason": reason, "updatedAt": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}


@router.post("/classes/{cid}/reactivate")
async def reactivate_class(cid: str, current=Depends(require_permission("classes.update"))):
    await ensure_class_access(cid, current)
    reactivated_at = now_iso()
    r = await db.classes.update_one(
        {"id": cid, "status": "inactive"},
        {"$set": {
            "status": "active",
            "reactivatedAt": reactivated_at,
            "updatedAt": reactivated_at,
        },
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        cls = await db.classes.find_one({"id": cid}, {"_id": 0, "id": 1})
        if not cls: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "الصف نشط بالفعل")
    return {"ok": True, "reactivated": True}
