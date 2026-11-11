import uuid

from fastapi import APIRouter, Depends, HTTPException

from school.core.database import db
from school.core.schemas import DeactivationIn
from school.core.services import (
    allowed_class_ids,
    ensure_student_access,
    generate_code,
    now_iso,
    require_permission,
)
from school.payments.fees import _fee_payables, _normalize_student_fees
from school.settings.services import _clean_reg_path
from school.students.schemas import StudentIn, StudentNoteIn
from school.students.services import _augment_student


router = APIRouter()


@router.get("/students/{sid}/full-information")
async def get_student_full(sid: str, current=Depends(require_permission("students.fullInformation.view"))):
    d = await ensure_student_access(sid, current)
    d.pop("_id", None)
    return await _augment_student(d, current)


async def _sync_sibling_links(student_id, student_doc, current, previous_siblings=None):
    siblings = student_doc.get("siblings") or []
    linked_ids = [
        sibling.get("studentId")
        for sibling in siblings
        if isinstance(sibling, dict) and sibling.get("studentId")
    ]
    if student_id in linked_ids:
        raise HTTPException(400, "لا يمكن ربط الطالب بنفسه كأخ أو أخت")
    if len(linked_ids) != len(set(linked_ids)):
        raise HTTPException(400, "لا يمكن ربط الطالب نفسه أكثر من مرة")

    linked_students = {}
    for sibling_id in linked_ids:
        linked_students[sibling_id] = await ensure_student_access(sibling_id, current)

    previous_ids = {
        sibling.get("studentId")
        for sibling in (previous_siblings or [])
        if isinstance(sibling, dict) and sibling.get("studentId")
    }
    desired_ids = set(linked_ids)
    for sibling_id in previous_ids - desired_ids:
        sibling_doc = await db.students.find_one({"id": sibling_id}, {"_id": 0})
        if not sibling_doc:
            continue
        sibling_doc["siblings"] = [
            sibling
            for sibling in sibling_doc.get("siblings") or []
            if not isinstance(sibling, dict)
            or sibling.get("studentId") != student_id
        ]
        sibling_doc["siblings"] = [
            {**sibling, "order": index + 1}
            if isinstance(sibling, dict)
            else sibling
            for index, sibling in enumerate(sibling_doc["siblings"])
        ]
        await db.students.update_one(
            {"id": sibling_id}, {"$set": {"siblings": sibling_doc["siblings"]}}
        )

    group = {student_id: student_doc, **linked_students}
    group_links = {}
    for group_student_id, group_student in group.items():
        student_data = group_student.get("student") or {}
        class_name = student_data.get("newClass") or ""
        if group_student.get("currentClassId"):
            class_doc = await db.classes.find_one(
                {"id": group_student["currentClassId"]}, {"_id": 0, "name": 1}
            )
            class_name = (class_doc or {}).get("name") or class_name
        group_links[group_student_id] = {
            "studentId": group_student_id,
            "fullName": student_data.get("fullName") or "",
            "gender": student_data.get("gender") or "",
            "class": class_name,
        }

    for group_student_id, group_student in linked_students.items():
        sibling_siblings = [
            sibling
            for sibling in group_student.get("siblings") or []
            if isinstance(sibling, dict)
        ]
        sibling_indexes = {
            sibling.get("studentId"): index
            for index, sibling in enumerate(sibling_siblings)
            if sibling.get("studentId")
        }
        for related_student_id, related_link in group_links.items():
            if related_student_id == group_student_id:
                continue
            if related_student_id in sibling_indexes:
                sibling_index = sibling_indexes[related_student_id]
                sibling_siblings[sibling_index] = {
                    **sibling_siblings[sibling_index],
                    **related_link,
                }
            else:
                sibling_indexes[related_student_id] = len(sibling_siblings)
                sibling_siblings.append(related_link)
        sibling_siblings = [
            {**sibling, "order": index + 1}
            for index, sibling in enumerate(sibling_siblings)
        ]
        await db.students.update_one(
            {"id": group_student_id}, {"$set": {"siblings": sibling_siblings}}
        )


@router.post("/students")
async def create_student(body: StudentIn, current=Depends(require_permission("students.create"))):
    p = body.model_dump()
    student_data = p.setdefault("student", {})
    if not student_data.get("registrationPath"):
        raise HTTPException(400, "مسار التسجيل الأولي مطلوب")
    student_data["finalRegistrationPath"] = student_data.get("finalRegistrationPath") or student_data.get("registrationPath") or ""
    await _clean_reg_path(student_data.get("registrationPath"))
    await _clean_reg_path(student_data.get("finalRegistrationPath"))
    p["id"] = str(uuid.uuid4())
    p["code"] = await generate_code("students")
    p["createdAt"] = now_iso(); p["updatedAt"] = now_iso()
    initial = p.pop("initialPayment", None)
    p["fees"] = _normalize_student_fees(p.get("fees") or {})
    academic_payable = _fee_payables(p["fees"])["academic"]
    if p.get("currentClassId"):
        if not await db.classes.find_one({"id": p["currentClassId"]}):
            raise HTTPException(400, "الصف غير موجود")
        allowed = await allowed_class_ids(current)
        if allowed is not None and p["currentClassId"] not in allowed:
            raise HTTPException(403, "لا يمكنك إضافة طالب إلى هذا الصف")
    await db.students.insert_one(p)
    await _sync_sibling_links(p["id"], p, current)
    if initial and float(initial.get("amount") or 0) > 0:
        amt = float(initial["amount"])
        if amt > academic_payable:
            await db.students.delete_one({"id": p["id"]})
            raise HTTPException(400, "الدفعة الأولى تتجاوز إجمالي المستحق")
        await db.payments.insert_one({"id": str(uuid.uuid4()), "student": p["id"],
            "academicYear": p["fees"]["academicYear"] or "", "feeType": "academic",
            "semester": initial.get("semester") or "full_year",
            "amount": amt, "paymentDate": initial.get("paymentDate") or now_iso(),
            "notes": "دفعة أولية عند التسجيل", "createdBy": current["id"],
            "createdAt": now_iso(), "updatedAt": now_iso()})
    return await _augment_student(await db.students.find_one({"id": p["id"]}, {"_id": 0}), current)


@router.put("/students/{sid}")
async def update_student(sid: str, body: StudentIn, current=Depends(require_permission("students.update"))):
    existing = await ensure_student_access(sid, current)
    p = body.model_dump()
    p.pop("initialPayment", None)
    student_data = p.setdefault("student", {})
    existing_student = existing.get("student") or {}
    if existing_student.get("registrationPath"):
        student_data["registrationPath"] = existing_student["registrationPath"]
    student_data.setdefault("registrationPath", existing_student.get("registrationPath", ""))
    student_data.setdefault("finalRegistrationPath", existing_student.get("finalRegistrationPath") or existing_student.get("registrationPath", ""))
    await _clean_reg_path(student_data.get("registrationPath"), existing_student.get("registrationPath"))
    await _clean_reg_path(student_data.get("finalRegistrationPath"), existing_student.get("finalRegistrationPath") or existing_student.get("registrationPath"))
    p["fees"] = _normalize_student_fees(p.get("fees") or {})
    if existing.get("orphanDocument"): p["orphanDocument"] = existing["orphanDocument"]
    if existing.get("code"): p["code"] = existing["code"]
    if p.get("currentClassId"):
        if not await db.classes.find_one({"id": p["currentClassId"]}):
            raise HTTPException(400, "الصف غير موجود")
        allowed = await allowed_class_ids(current)
        if allowed is not None and p["currentClassId"] not in allowed:
            raise HTTPException(403, "لا يمكنك نقل الطالب إلى هذا الصف")
    p["updatedAt"] = now_iso()
    await db.students.update_one({"id": sid}, {"$set": p})
    await _sync_sibling_links(sid, p, current, existing.get("siblings") or [])
    return await _augment_student(await db.students.find_one({"id": sid}, {"_id": 0}), current)


STUDENT_NOTE_FIELDS = {"class": "classNotes", "non-class": "nonClassNotes"}


def _student_note_field(category):
    field = STUDENT_NOTE_FIELDS.get(category)
    if not field:
        raise HTTPException(400, "نوع الملاحظة غير صالح")
    return field


@router.get("/students/{sid}/notes")
async def list_student_notes(sid: str, current=Depends(require_permission("students.notes.view"))):
    student = await ensure_student_access(sid, current)
    result = {}
    for category, field in STUDENT_NOTE_FIELDS.items():
        notes = student.get(field) or []
        if current.get("teacherId"):
            notes = [note for note in notes if note.get("authorId") == current["id"]]
        result[field] = notes
    return result


@router.post("/students/{sid}/notes/{category}")
async def create_student_note(sid: str, category: str, body: StudentNoteIn,
                              current=Depends(require_permission("students.notes.create"))):
    await ensure_student_access(sid, current)
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "نص الملاحظة مطلوب")
    if len(content) > 4000:
        raise HTTPException(400, "الملاحظة طويلة جداً")
    field = _student_note_field(category)
    timestamp = now_iso()
    note = {"id": str(uuid.uuid4()), "content": content, "authorId": current["id"],
            "authorName": current.get("name") or current.get("username") or "—",
            "createdAt": timestamp, "updatedAt": timestamp}
    await db.students.update_one({"id": sid}, {"$push": {field: note}})
    return note


@router.put("/students/{sid}/notes/{category}/{note_id}")
async def update_student_note(sid: str, category: str, note_id: str, body: StudentNoteIn,
                              current=Depends(require_permission("students.notes.update"))):
    student = await ensure_student_access(sid, current)
    content = body.content.strip()
    if not content:
        raise HTTPException(400, "نص الملاحظة مطلوب")
    if len(content) > 4000:
        raise HTTPException(400, "الملاحظة طويلة جداً")
    field = _student_note_field(category)
    notes = student.get(field) or []
    note = next((item for item in notes if item.get("id") == note_id), None)
    if not note or (current.get("teacherId") and note.get("authorId") != current["id"]):
        raise HTTPException(404, "الملاحظة غير موجودة")
    note["content"] = content
    note["updatedAt"] = now_iso()
    await db.students.update_one({"id": sid}, {"$set": {field: notes}})
    return note


@router.delete("/students/{sid}/notes/{category}/{note_id}")
async def delete_student_note(sid: str, category: str, note_id: str,
                              current=Depends(require_permission("students.notes.delete"))):
    student = await ensure_student_access(sid, current)
    field = _student_note_field(category)
    notes = student.get(field) or []
    note = next((item for item in notes if item.get("id") == note_id), None)
    if not note or (current.get("teacherId") and note.get("authorId") != current["id"]):
        raise HTTPException(404, "الملاحظة غير موجودة")
    await db.students.update_one({"id": sid}, {"$set": {field: [item for item in notes if item.get("id") != note_id]}})
    return {"ok": True}


@router.delete("/students/{sid}")
async def delete_student(sid: str, body: DeactivationIn, current=Depends(require_permission("students.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    await ensure_student_access(sid, current)
    deactivated_at = now_iso()
    r = await db.students.update_one(
        {"id": sid},
        {"$set": {"student.status": "inactive", "deactivatedAt": deactivated_at,
                   "deactivationReason": reason, "updatedAt": deactivated_at}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}


@router.post("/students/{sid}/reactivate")
async def reactivate_student(sid: str, current=Depends(require_permission("students.update"))):
    await ensure_student_access(sid, current)
    reactivated_at = now_iso()
    r = await db.students.update_one(
        {"id": sid, "student.status": "inactive"},
        {"$set": {
            "student.status": "resident",
            "reactivatedAt": reactivated_at,
            "updatedAt": reactivated_at,
        }},
    )
    if r.matched_count == 0:
        student = await db.students.find_one({"id": sid}, {"_id": 0, "id": 1})
        if not student: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "الطالب نشط بالفعل")
    return {"ok": True, "reactivated": True}
