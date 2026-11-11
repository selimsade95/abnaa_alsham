import asyncio
import logging
import os
import uuid
from typing import List

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, TypeAdapter, ValidationError

from school.core.database import db, raw_db
from school.core.services import now_iso, require_permission
from school.messages.schemas import ContactFormIn, MessageReplyIn, PublicMessageIn


router = APIRouter()


MESSAGE_TYPE_LABELS = {
    "complaint": "شكوى",
    "suggestion": "اقتراح",
    "inquiry": "استفسار",
    "other": "أخرى",
}


async def _send_message_email(recipient, subject, content):
    api_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("MAIL_FROM")
    if not api_key or not sender:
        raise RuntimeError("إعدادات البريد الإلكتروني غير مكتملة")

    payload = {
        "from": sender,
        "to": recipient,
        "subject": subject,
        "text": content,
    }

    def send_request():
        try:
            response = requests.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "abnaa-alsham-backend/1.0",
                },
                timeout=30,
            )
            response.raise_for_status()
        except requests.HTTPError as error:
            response = error.response
            detail = response.text[:1000] if response is not None else str(error)
            status_code = response.status_code if response is not None else "unknown"
            raise RuntimeError(
                f"Resend returned HTTP {status_code}: {detail}"
            ) from error
        except requests.RequestException as error:
            raise RuntimeError(f"Could not reach Resend: {error}") from error

    await asyncio.to_thread(send_request)


async def _send_contact_form_email(contact_message):
    api_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("MAIL_FROM_CONTACT")
    if not api_key or not sender:
        raise RuntimeError("إعدادات بريد نموذج التواصل غير مكتملة")

    configured_recipients = [
        address.strip()
        for address in os.environ.get("CONTACT_EMAILS", "").split(",")
        if address.strip()
    ]
    if not configured_recipients or len(configured_recipients) > 5:
        raise RuntimeError("يجب إعداد عنوان بريد واحد إلى خمسة عناوين لاستقبال الرسائل")
    try:
        recipients = [
            str(address)
            for address in TypeAdapter(List[EmailStr]).validate_python(
                configured_recipients
            )
        ]
    except ValidationError as error:
        raise RuntimeError("قائمة عناوين بريد نموذج التواصل غير صالحة") from error

    text = (
        f"رسالة جديدة من نموذج التواصل في مدرسة أبناء الشام\n\n"
        f"الاسم: {contact_message['name']}\n"
        f"البريد الإلكتروني: {contact_message.get('email') or 'غير مذكور'}\n"
        f"المكتب: {contact_message.get('office') or 'غير محدد'}\n"
        f"رقم الهاتف: {contact_message['phone']}\n"
        f"نوع الرسالة: {MESSAGE_TYPE_LABELS[contact_message['messageType']]}\n"
        f"الموضوع: {contact_message['subject']}\n\n"
        f"الرسالة:\n{contact_message['message']}"
    )
    payload = {
        "from": sender,
        "to": recipients[0],
        "subject": (
            f"{MESSAGE_TYPE_LABELS[contact_message['messageType']]}: "
            f"{contact_message['subject']}"
        ),
        "text": text,
    }
    if len(recipients) > 1:
        payload["cc"] = recipients[1:]
    if contact_message.get("email"):
        payload["reply_to"] = str(contact_message["email"])

    def send_request():
        try:
            response = requests.post(
                "https://api.resend.com/emails",
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "abnaa-alsham-backend/1.0",
                },
                timeout=30,
            )
            response.raise_for_status()
        except requests.HTTPError as error:
            response = error.response
            detail = response.text[:1000] if response is not None else str(error)
            status_code = response.status_code if response is not None else "unknown"
            raise RuntimeError(
                f"Resend returned HTTP {status_code}: {detail}"
            ) from error
        except requests.RequestException as error:
            raise RuntimeError(f"Could not reach Resend: {error}") from error

    await asyncio.to_thread(send_request)


@router.post("/public/contact-messages")
async def create_contact_message(body: ContactFormIn):
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "email": str(body.email) if body.email else None,
        "createdAt": now_iso(),
        "emailDeliveryStatus": "pending",
        "emailDeliveryError": None,
    }
    await db.contact_messages.insert_one(doc)
    try:
        await _send_contact_form_email(doc)
    except Exception as exc:
        logging.exception("Could not send contact-form email")
        await db.contact_messages.update_one(
            {"id": doc["id"]},
            {"$set": {
                "emailDeliveryStatus": "failed",
                "emailDeliveryError": str(exc)[:500],
            }},
        )
        raise HTTPException(
            502,
            "تم حفظ رسالتك لكن تعذر إرسال البريد الإلكتروني، يرجى المحاولة لاحقاً",
        ) from exc

    await db.contact_messages.update_one(
        {"id": doc["id"]},
        {"$set": {
            "emailDeliveryStatus": "sent",
            "emailDeliveryError": None,
            "emailSentAt": now_iso(),
        }},
    )
    return {"ok": True, "id": doc["id"]}


@router.post("/public/students/{sid}/messages")
async def create_public_message(sid: str, body: PublicMessageIn):
    student = await raw_db.students.find_one(
        {"id": sid}, {"_id": 0, "code": 1, "student.fullName": 1}
    )
    if not student:
        raise HTTPException(404, "الطالب غير موجود")
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "email": str(body.email),
        "messageTypeLabel": MESSAGE_TYPE_LABELS[body.messageType],
        "studentId": sid,
        "studentName": (student.get("student") or {}).get("fullName"),
        "studentCode": student.get("code"),
        "status": "open",
        "createdAt": now_iso(),
        "response": "",
        "responseBy": None,
        "responseAt": None,
        "emailDeliveryStatus": None,
        "emailDeliveryError": None,
        "branchId": student.get("branchId"),
    }
    await raw_db.verification_messages.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"]}


@router.get("/messages")
async def list_verification_messages(
    current=Depends(require_permission("messages.view")),
):
    return await db.verification_messages.find(
        {}, {"_id": 0, "emailDeliveryError": 0}
    ).sort("createdAt", -1).to_list(1000)


async def _deliver_message_response(message):
    try:
        await _send_message_email(
            message["email"],
            "الرد على رسالتك إلى مدرسة أبناء الشام",
            f"مرحباً {message['name']}،\n\n"
            f"رد المدرسة على رسالتك ({message['messageTypeLabel']}):\n\n"
            f"{message['response']}\n\nمدرسة أبناء الشام",
        )
    except Exception as exc:
        logging.exception("Could not send verification-message reply")
        await db.verification_messages.update_one(
            {"id": message["id"]},
            {"$set": {
                "emailDeliveryStatus": "failed",
                "emailDeliveryError": str(exc)[:500],
            }},
        )
        raise HTTPException(502, "تم حفظ الرد لكن تعذر إرسال البريد الإلكتروني") from exc

    await db.verification_messages.update_one(
        {"id": message["id"]},
        {"$set": {
            "emailDeliveryStatus": "sent",
            "emailDeliveryError": None,
            "emailSentAt": now_iso(),
        }},
    )


@router.post("/messages/{message_id}/reply")
async def reply_to_verification_message(
    message_id: str,
    body: MessageReplyIn,
    current=Depends(require_permission("messages.reply")),
):
    message = await db.verification_messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(404, "الرسالة غير موجودة")
    updated_at = now_iso()
    await db.verification_messages.update_one(
        {"id": message_id},
        {"$set": {
            "response": body.response,
            "responseBy": current.get("name") or current.get("username"),
            "responseAt": updated_at,
            "status": "responded",
            "emailDeliveryStatus": "pending",
            "emailDeliveryError": None,
        }},
    )
    message.update({
        "response": body.response,
        "responseAt": updated_at,
        "messageTypeLabel": message.get("messageTypeLabel")
        or MESSAGE_TYPE_LABELS.get(message.get("messageType"), "أخرى"),
    })
    await _deliver_message_response(message)
    return await db.verification_messages.find_one(
        {"id": message_id}, {"_id": 0, "emailDeliveryError": 0}
    )


@router.post("/messages/{message_id}/resend")
async def resend_verification_message_reply(
    message_id: str,
    current=Depends(require_permission("messages.reply")),
):
    message = await db.verification_messages.find_one({"id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(404, "الرسالة غير موجودة")
    if not message.get("response"):
        raise HTTPException(400, "لا يوجد رد لإعادة إرساله")
    message["messageTypeLabel"] = message.get("messageTypeLabel") or MESSAGE_TYPE_LABELS.get(
        message.get("messageType"), "أخرى"
    )
    await _deliver_message_response(message)
    return await db.verification_messages.find_one(
        {"id": message_id}, {"_id": 0, "emailDeliveryError": 0}
    )
