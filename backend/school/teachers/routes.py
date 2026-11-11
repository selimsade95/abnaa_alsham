import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from school.core.csv_upload import _read_csv_rows
from school.core.database import db, TEACHER_DOCUMENTS_DIR
from school.core.schemas import DeactivationIn
from school.core.services import generate_code, get_current_user, now_iso, require_permission
from school.core.uploads import _save_upload
from school.teachers.schemas import TeacherIn


router = APIRouter()


async def _teacher_out(t):
    t.pop("_id", None)
    certificate = t.get("certificateFile")
    if isinstance(certificate, dict):
        t["certificateFile"] = {
            key: value for key, value in certificate.items() if key != "filePath"
        }
    return t


@router.get("/teachers")
async def list_teachers(search: Optional[str] = None, gender: Optional[str] = None,
                        employmentStatus: Optional[str] = None, specialization: Optional[str] = None,
                        page: int = 1, limit: int = 10,
                        current=Depends(require_permission("teachers.view"))):
    # Inactive records are retained for history but stay out of normal lists.
    q = {} if employmentStatus == "all" else {"employmentStatus": employmentStatus or {"$ne": "inactive"}}
    if gender: q["gender"] = gender
    if specialization:
        q.setdefault("$and", []).append({"$or": [
            {"specialization": {"$regex": specialization, "$options": "i"}},
            {"department": {"$regex": specialization, "$options": "i"}},
            {"jobDescription": {"$regex": specialization, "$options": "i"}},
        ]})
    if search:
        rx = {"$regex": search, "$options": "i"}
        q.setdefault("$and", []).append({"$or": [
            {"fullName": rx}, {"phone": rx}, {"contactPhone": rx}, {"address": rx},
            {"code": rx}, {"specialization": rx}, {"department": rx}, {"jobDescription": rx},
        ]})
    total = await db.teachers.count_documents(q)
    skip = max(0, (page - 1) * limit)
    docs = await db.teachers.find(q, {"_id": 0}).sort("createdAt", -1).skip(skip).limit(limit).to_list(limit)
    docs = [await _teacher_out(doc) for doc in docs]
    return {"data": docs, "pagination": {"page": page, "limit": limit, "total": total, "totalPages": (total + limit - 1) // limit}}


@router.post("/teachers/import")
async def import_teachers(file: UploadFile = File(...), current=Depends(require_permission("teachers.create"))):
    rows = await _read_csv_rows(file)
    if not rows or "fullName" not in rows[0]:
        raise HTTPException(400, "قالب المعلمين غير صحيح")
    created = []
    for index, row in enumerate(rows, 2):
        if not (row.get("fullName") or "").strip():
            raise HTTPException(400, f"اسم المعلم مطلوب في الصف {index}")
        def value(key):
            return (row.get(key) or "").strip()

        phone = value("contactPhone") or value("phone")
        education = value("education") or value("qualification")
        job_description = value("jobDescription") or value("specialization")
        code = await generate_code("teachers")
        doc = {"id": str(uuid.uuid4()), "code": code,
               "fullName": value("fullName"), "gender": value("gender"),
               "phone": phone, "contactPhone": phone, "address": value("address"),
               "specialization": job_description, "jobDescription": job_description,
               "qualification": education, "education": education,
               "employmentStatus": value("employmentStatus") or "active",
               "fatherName": value("fatherName"), "motherName": value("motherName"),
               "birthPlace": value("birthPlace"), "birthDate": value("birthDate"),
               "idNumber": value("idNumber"), "martialStatus": value("martialStatus"),
               "maleChildrenCount": value("maleChildrenCount"),
               "femaleChildrenCount": value("femaleChildrenCount"),
               "workStartDate": value("workStartDate"), "department": value("department"),
               "office": value("office"), "volunteer": value("volunteer").lower(),
               "skills": value("skills"), "certificate": value("certificate"),
               "notes": value("notes"), "createdAt": now_iso(), "updatedAt": now_iso()}
        await db.teachers.insert_one(doc); created.append(doc["id"])
    return {"ok": True, "created": len(created)}


@router.get("/teachers/{tid}")
async def get_teacher(tid: str, current=Depends(require_permission("teachers.view"))):
    t = await db.teachers.find_one({"id": tid}, {"_id": 0})
    if not t: raise HTTPException(404, "غير موجود")
    return await _teacher_out(t)


@router.post("/teachers")
async def create_teacher(body: TeacherIn, current=Depends(require_permission("teachers.create"))):
    if not body.fullName.strip(): raise HTTPException(400, "الاسم مطلوب")
    code = await generate_code("teachers")
    doc = {"id": str(uuid.uuid4()), "code": code, **body.model_dump(),
           "createdAt": now_iso(), "updatedAt": now_iso()}
    await db.teachers.insert_one(doc)
    return await _teacher_out(doc)


@router.put("/teachers/{tid}")
async def update_teacher(tid: str, body: TeacherIn, current=Depends(require_permission("teachers.update"))):
    if not await db.teachers.find_one({"id": tid}): raise HTTPException(404, "غير موجود")
    upd = {**body.model_dump(), "updatedAt": now_iso()}
    await db.teachers.update_one({"id": tid}, {"$set": upd})
    return await _teacher_out(await db.teachers.find_one({"id": tid}, {"_id": 0}))


async def require_teacher_certificate_permission(current=Depends(get_current_user)):
    if not current.get("branchId"):
        raise HTTPException(428, "يرجى اختيار الفرع أولاً")
    if not {"teachers.create", "teachers.update"}.intersection(
        current.get("permissions") or []
    ):
        raise HTTPException(403, "لا تملك صلاحية رفع شهادة المعلم")
    return current


@router.post("/teachers/{tid}/certificate")
async def upload_teacher_certificate(tid: str, file: UploadFile = File(...),
                                    current=Depends(require_teacher_certificate_permission)):
    teacher = await db.teachers.find_one({"id": tid})
    if not teacher:
        raise HTTPException(404, "المعلم غير موجود")
    fname, fpath, mime, size = await _save_upload(
        file, TEACHER_DOCUMENTS_DIR, teacher.get("code") or tid
    )
    old_path = (teacher.get("certificateFile") or {}).get("filePath")
    certificate = {
        "fileName": fname,
        "originalName": file.filename or fname,
        "filePath": str(fpath),
        "mimeType": mime,
        "size": size,
        "uploadedAt": now_iso(),
        "uploadedBy": current["id"],
    }
    await db.teachers.update_one(
        {"id": tid},
        {"$set": {"certificateFile": certificate, "updatedAt": now_iso()}},
    )
    if old_path:
        try:
            os.remove(old_path)
        except OSError:
            pass
    return await _teacher_out(certificate)


@router.get("/teachers/{tid}/certificate")
async def get_teacher_certificate(tid: str, current=Depends(require_permission("teachers.view"))):
    teacher = await db.teachers.find_one({"id": tid})
    if not teacher:
        raise HTTPException(404, "المعلم غير موجود")
    certificate = teacher.get("certificateFile") or {}
    path = certificate.get("filePath")
    if not path or not os.path.exists(path):
        raise HTTPException(404, "لا توجد شهادة مرفقة")
    return FileResponse(
        path,
        media_type=certificate.get("mimeType") or "application/octet-stream",
        filename=certificate.get("originalName") or certificate.get("fileName"),
    )


@router.delete("/teachers/{tid}")
async def delete_teacher(tid: str, body: DeactivationIn, current=Depends(require_permission("teachers.delete"))):
    reason = body.reason.strip()
    if not reason: raise HTTPException(400, "سبب التعطيل مطلوب")
    r = await db.teachers.update_one(
        {"id": tid},
        {"$set": {"employmentStatus": "inactive", "deactivatedAt": now_iso(),
                   "deactivationReason": reason, "updatedAt": now_iso()}},
    )
    if r.matched_count == 0: raise HTTPException(404, "غير موجود")
    return {"ok": True, "deactivated": True}


@router.post("/teachers/{tid}/reactivate")
async def reactivate_teacher(tid: str, current=Depends(require_permission("teachers.update"))):
    reactivated_at = now_iso()
    r = await db.teachers.update_one(
        {"id": tid, "employmentStatus": "inactive"},
        {"$set": {
            "employmentStatus": "active",
            "reactivatedAt": reactivated_at,
            "updatedAt": reactivated_at,
        },
         "$unset": {"deactivatedAt": ""}},
    )
    if r.matched_count == 0:
        teacher = await db.teachers.find_one({"id": tid}, {"_id": 0, "id": 1})
        if not teacher: raise HTTPException(404, "غير موجود")
        raise HTTPException(400, "المعلم نشط بالفعل")
    return {"ok": True, "reactivated": True}
