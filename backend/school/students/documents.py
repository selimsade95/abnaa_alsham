import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from school.core.database import db, ORPHAN_DIR, raw_db, STUDENT_DOCUMENTS_DIR
from school.core.services import ensure_student_access, now_iso, require_permission
from school.core.uploads import _save_upload


router = APIRouter()


STUDENT_DOCUMENT_TYPES = {
    "student_id": "إخراج قيد / هوية الطالب",
    "family_father": "بيان عائلي / دفتر العائلة — صفحة الأب",
    "family_mother": "بيان عائلي / دفتر العائلة — صفحة الأم",
    "family_student": "بيان عائلي / دفتر العائلة — صفحة الطالب",
    "personal_photo": "صورة شخصية",
    "address_document": "طبعة الإحصاء",
    "mother_id_front": "هوية الأم — الوجه الأمامي",
    "mother_id_back": "هوية الأم — الوجه الخلفي",
}


@router.post("/students/{sid}/documents/{document_type}")
async def upload_student_document(sid: str, document_type: str, file: UploadFile = File(...),
                                  current=Depends(require_permission("students.documents.upload"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await db.students.find_one({"id": sid})
    if not student:
        raise HTTPException(404, "الطالب غير موجود")
    await ensure_student_access(sid, current)
    fname, fpath, mime, size = await _save_upload(file, STUDENT_DOCUMENTS_DIR, student.get("code") or sid)
    old = ((student.get("documents") or {}).get(document_type) or {}).get("filePath")
    meta = {"type": document_type, "label": STUDENT_DOCUMENT_TYPES[document_type], "fileName": fname,
            "originalName": file.filename or fname, "filePath": str(fpath), "mimeType": mime,
            "size": size, "uploadedAt": now_iso(), "uploadedBy": current["id"]}
    await db.students.update_one({"id": sid}, {"$set": {f"documents.{document_type}": meta, "updatedAt": now_iso()}})
    if old:
        try: os.remove(old)
        except OSError: pass
    return {k: v for k, v in meta.items() if k != "filePath"}


@router.get("/students/{sid}/documents/{document_type}")
async def get_student_document(sid: str, document_type: str,
                               current=Depends(require_permission("students.documents.view"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await db.students.find_one({"id": sid})
    await ensure_student_access(sid, current)
    document = ((student or {}).get("documents") or {}).get(document_type)
    if not document or not document.get("filePath") or not os.path.exists(document["filePath"]):
        raise HTTPException(404, "لا توجد وثيقة")
    return FileResponse(document["filePath"], media_type=document.get("mimeType") or "application/octet-stream",
                        filename=document.get("originalName") or document.get("fileName"))


@router.delete("/students/{sid}/documents/{document_type}")
async def delete_student_document(sid: str, document_type: str,
                                  current=Depends(require_permission("students.documents.delete"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await db.students.find_one({"id": sid})
    if not student:
        raise HTTPException(404, "الطالب غير موجود")
    await ensure_student_access(sid, current)
    document = ((student.get("documents") or {}).get(document_type) or {})
    if document.get("filePath"):
        try: os.remove(document["filePath"])
        except OSError: pass
    await db.students.update_one({"id": sid}, {"$unset": {f"documents.{document_type}": ""}, "$set": {"updatedAt": now_iso()}})
    return {"ok": True}


@router.get("/public/students/{sid}/validation/personal-photo")
async def get_public_personal_photo(sid: str):
    student = await raw_db.students.find_one(
        {"id": sid}, {"_id": 0, "documents.personal_photo": 1}
    )
    document = ((student or {}).get("documents") or {}).get("personal_photo") or {}
    if not document.get("filePath") or not os.path.exists(document["filePath"]):
        raise HTTPException(404, "لا توجد صورة شخصية")
    return FileResponse(document["filePath"], media_type=document.get("mimeType") or "image/jpeg")


@router.post("/students/{sid}/orphan-document")
async def upload_orphan_doc(sid: str, type: str = Form(...), description: Optional[str] = Form(""),
                             file: UploadFile = File(...),
                             current=Depends(require_permission("students.orphanDocument.upload"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "الطالب غير موجود")
    await ensure_student_access(sid, current)
    fname, fpath, mime, size = await _save_upload(file, ORPHAN_DIR, student.get("code") or sid)
    old = (student.get("orphanDocument") or {}).get("filePath")
    if old:
        try: os.remove(old)
        except Exception: pass
    meta = {"type": type, "description": description or "", "fileName": fname,
            "originalName": file.filename or fname, "filePath": str(fpath),
            "mimeType": mime, "size": size, "uploadedAt": now_iso(), "uploadedBy": current["id"]}
    await db.students.update_one({"id": sid}, {"$set": {"orphanDocument": meta, "updatedAt": now_iso()}})
    return {k: v for k, v in meta.items() if k != "filePath"}


@router.get("/students/{sid}/orphan-document")
async def get_orphan_doc(sid: str, current=Depends(require_permission("students.orphanDocument.view"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "غير موجود")
    await ensure_student_access(sid, current)
    od = student.get("orphanDocument")
    if not od or not od.get("filePath") or not os.path.exists(od["filePath"]):
        raise HTTPException(404, "لا توجد وثيقة")
    return FileResponse(od["filePath"], media_type=od.get("mimeType") or "application/octet-stream",
                        filename=od.get("originalName") or od.get("fileName"))


@router.delete("/students/{sid}/orphan-document")
async def delete_orphan_doc(sid: str, current=Depends(require_permission("students.orphanDocument.delete"))):
    student = await db.students.find_one({"id": sid})
    if not student: raise HTTPException(404, "غير موجود")
    await ensure_student_access(sid, current)
    od = student.get("orphanDocument")
    if not od: return {"ok": True}
    if od.get("filePath"):
        try: os.remove(od["filePath"])
        except Exception: pass
    await db.students.update_one({"id": sid}, {"$unset": {"orphanDocument": ""}, "$set": {"updatedAt": now_iso()}})
    return {"ok": True}
