from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from school.core.database import db, ORPHAN_DIR, STUDENT_DOCUMENTS_DIR
from school.core.services import ensure_student_access, now_iso, require_permission
from school.core.uploads import _save_upload, private_download, remove_upload


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
    student = await ensure_student_access(sid, current)
    fname, fpath, mime, size = await _save_upload(file, STUDENT_DOCUMENTS_DIR, images_only=document_type == "personal_photo")
    old = ((student.get("documents") or {}).get(document_type) or {}).get("filePath")
    meta = {"type": document_type, "label": STUDENT_DOCUMENT_TYPES[document_type], "fileName": fname,
            "originalName": file.filename or fname, "filePath": str(fpath), "mimeType": mime,
            "size": size, "uploadedAt": now_iso(), "uploadedBy": current["id"]}
    await db.students.update_one({"id": sid}, {"$set": {f"documents.{document_type}": meta, "updatedAt": now_iso()}})
    remove_upload(STUDENT_DOCUMENTS_DIR, old)
    return {k: v for k, v in meta.items() if k != "filePath"}


@router.get("/students/{sid}/documents/{document_type}")
async def get_student_document(sid: str, document_type: str,
                               current=Depends(require_permission("students.documents.view"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await ensure_student_access(sid, current)
    document = ((student or {}).get("documents") or {}).get(document_type)
    return private_download(STUDENT_DOCUMENTS_DIR, document, images_only=document_type == "personal_photo")


@router.delete("/students/{sid}/documents/{document_type}")
async def delete_student_document(sid: str, document_type: str,
                                  current=Depends(require_permission("students.documents.delete"))):
    if document_type not in STUDENT_DOCUMENT_TYPES:
        raise HTTPException(400, "نوع الوثيقة غير صالح")
    student = await ensure_student_access(sid, current)
    document = ((student.get("documents") or {}).get(document_type) or {})
    await db.students.update_one({"id": sid}, {"$unset": {f"documents.{document_type}": ""}, "$set": {"updatedAt": now_iso()}})
    remove_upload(STUDENT_DOCUMENTS_DIR, document.get("filePath"))
    return {"ok": True}


@router.post("/students/{sid}/orphan-document")
async def upload_orphan_doc(sid: str, type: str = Form(...), description: Optional[str] = Form(""),
                             file: UploadFile = File(...),
                             current=Depends(require_permission("students.orphanDocument.upload"))):
    student = await ensure_student_access(sid, current)
    fname, fpath, mime, size = await _save_upload(file, ORPHAN_DIR)
    old = (student.get("orphanDocument") or {}).get("filePath")
    meta = {"type": type, "description": description or "", "fileName": fname,
            "originalName": file.filename or fname, "filePath": str(fpath),
            "mimeType": mime, "size": size, "uploadedAt": now_iso(), "uploadedBy": current["id"]}
    await db.students.update_one({"id": sid}, {"$set": {"orphanDocument": meta, "updatedAt": now_iso()}})
    remove_upload(ORPHAN_DIR, old)
    return {k: v for k, v in meta.items() if k != "filePath"}


@router.get("/students/{sid}/orphan-document")
async def get_orphan_doc(sid: str, current=Depends(require_permission("students.orphanDocument.view"))):
    student = await ensure_student_access(sid, current)
    od = student.get("orphanDocument")
    return private_download(ORPHAN_DIR, od)


@router.delete("/students/{sid}/orphan-document")
async def delete_orphan_doc(sid: str, current=Depends(require_permission("students.orphanDocument.delete"))):
    student = await ensure_student_access(sid, current)
    od = student.get("orphanDocument")
    if not od: return {"ok": True}
    await db.students.update_one({"id": sid}, {"$unset": {"orphanDocument": ""}, "$set": {"updatedAt": now_iso()}})
    remove_upload(ORPHAN_DIR, od.get("filePath"))
    return {"ok": True}
