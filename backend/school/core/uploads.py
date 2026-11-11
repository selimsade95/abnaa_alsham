import mimetypes
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile

from school.core.database import ALLOWED_EXTS, ALLOWED_MIMES, MAX_UPLOAD_BYTES


def _validate_upload(file: UploadFile):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, "امتداد ملف غير مسموح")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime and mime not in ALLOWED_MIMES:
        raise HTTPException(400, "نوع ملف غير مسموح")
    return ext, mime


async def _save_upload(file: UploadFile, directory: Path, student_code: str):
    ext, mime = _validate_upload(file)
    safe_code = re.sub(r"[^A-Za-z0-9_-]", "", student_code or "student")
    fname = f"stu-{safe_code}-{int(datetime.now(timezone.utc).timestamp() * 1000)}{ext}"
    fpath = directory / fname
    size = 0
    with open(fpath, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                # Close it first. Windows takes an open file very personally.
                out.close()
                os.remove(fpath)
                raise HTTPException(400, f"حجم الملف يتجاوز {MAX_UPLOAD_BYTES // (1024*1024)}MB")
            out.write(chunk)
    return fname, fpath, mime, size
