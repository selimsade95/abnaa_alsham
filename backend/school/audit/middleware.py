import json
import logging
import re
import uuid

import jwt
from pymongo.errors import PyMongoError

from school.core.database import JWT_ALGORITHM, JWT_SECRET, raw_db
from school.core.services import now_iso


AUDIT_IGNORED_PATHS = {
    "/api/auth/login",
    "/api/auth/select-branch",
    "/api/auth/logout",
    "/api/settings/code-generation/preview",
}


async def audit_data_changes(request, call_next):
    request_label = None
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and request.url.path not in AUDIT_IGNORED_PATHS
        and request.headers.get("content-type", "").split(";", 1)[0].lower()
        == "application/json"
    ):
        content_length = request.headers.get("content-length")
        if (
            content_length
            and content_length.isdigit()
            and int(content_length) <= 1024 * 1024
        ):
            original_receive = request._receive
            body = await request.body()
            try:
                request_label = _audit_request_label(json.loads(body))
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass

            body_sent = False

            async def receive_body():
                nonlocal body_sent
                if not body_sent:
                    body_sent = True
                    return {
                        "type": "http.request",
                        "body": body,
                        "more_body": False,
                    }
                return await original_receive()

            request._receive = receive_body

    response = await call_next(request)
    if (
        request.method not in {"POST", "PUT", "PATCH", "DELETE"}
        or request.url.path in AUDIT_IGNORED_PATHS
        or response.status_code >= 400
    ):
        return response

    claims = {}
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.InvalidTokenError:
            pass

    audit_record = {
        "id": str(uuid.uuid4()),
        "method": request.method,
        "path": request.url.path,
        "requestLabel": request_label or _audit_route_label(request.url.path),
        "statusCode": response.status_code,
        "userId": claims.get("sub"),
        "username": claims.get("username"),
        "branchId": claims.get("branchId"),
        "createdAt": now_iso(),
    }
    try:
        await raw_db.audit_logs.insert_one(audit_record)
    except PyMongoError:
        logging.exception(
            "Failed to write audit log for %s %s",
            request.method,
            request.url.path,
        )
    return response


def _audit_request_label(payload):
    preferred_keys = (
        "title", "name", "fullName", "studentName", "teacherName",
        "className", "branchName", "username", "code",
    )
    pending = [payload]
    while pending:
        value = pending.pop(0)
        if isinstance(value, dict):
            for key in preferred_keys:
                label = value.get(key)
                if isinstance(label, str) and label.strip():
                    return label.strip()[:200]
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
    return None


def _audit_route_label(path):
    parts = [
        part for part in path.strip("/").split("/")
        if part and part.lower() != "api"
    ]
    for part in reversed(parts):
        if re.fullmatch(r"[0-9a-fA-F-]{16,}", part) or part.isdigit():
            continue
        return part.replace("-", " ").replace("_", " ").strip().title()
    return "Request"
