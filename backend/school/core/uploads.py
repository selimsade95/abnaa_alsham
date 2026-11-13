from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse

from school.core.database import MAX_UPLOAD_BYTES


FILE_TYPES = {
    ".pdf": ("application/pdf", b"%PDF-"),
    ".jpg": ("image/jpeg", bytes.fromhex("ffd8ff")),
    ".jpeg": ("image/jpeg", bytes.fromhex("ffd8ff")),
    ".png": ("image/png", bytes.fromhex("89504e470d0a1a0a")),
}


def stored_file(directory, value):
    if not value:
        return None
    try:
        root = directory.resolve()
        path = Path(value).absolute()
        if not path.is_relative_to(directory.absolute()) and not path.is_relative_to(root):
            return None
        path = path.resolve(strict=True)
        if path.is_relative_to(root) and path.is_file():
            return path
    except (OSError, ValueError, RuntimeError):
        pass
    return None


def remove_upload(directory, value):
    path = stored_file(directory, value)
    if path:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def private_download(directory, metadata, *, images_only=False):
    metadata = metadata or {}
    path = stored_file(directory, metadata.get("filePath"))
    if not path or path.suffix.lower() not in FILE_TYPES:
        raise HTTPException(404, "لا يوجد ملف مرفق")
    mime, signature = FILE_TYPES[path.suffix.lower()]
    if images_only and not mime.startswith("image/"):
        raise HTTPException(404, "لا توجد صورة شخصية")
    try:
        with path.open("rb") as source:
            valid = source.read(len(signature)) == signature
    except OSError:
        valid = False
    if not valid:
        raise HTTPException(404, "الملف غير متاح")
    return FileResponse(
        path, media_type=mime, filename=metadata.get("originalName") or path.name,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


async def _save_upload(file: UploadFile, directory: Path, *, images_only=False):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in FILE_TYPES:
        raise HTTPException(400, "امتداد ملف غير مسموح")
    mime, signature = FILE_TYPES[extension]
    if images_only and not mime.startswith("image/"):
        raise HTTPException(400, "يرجى رفع صورة شخصية")
    chunk = await file.read(1024 * 1024)
    if not chunk.startswith(signature):
        raise HTTPException(400, "محتوى الملف لا يطابق نوعه")
    filename = f"{uuid4().hex}{extension}"
    path = directory / filename
    size = 0
    try:
        with path.open("xb") as destination:
            while chunk:
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "حجم الملف يتجاوز الحد المسموح")
                destination.write(chunk)
                chunk = await file.read(1024 * 1024)
    except BaseException:
        remove_upload(directory, path)
        raise
    return filename, path, mime, size
