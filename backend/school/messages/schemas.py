from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class PublicMessageIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=5, max_length=30)
    email: EmailStr
    messageType: Literal["complaint", "suggestion", "inquiry", "other"]
    content: str = Field(min_length=1, max_length=10000)

    @field_validator("name", "phone", "content")
    @classmethod
    def strip_and_require_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("هذا الحقل مطلوب")
        return value


class ContactFormIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    office: Optional[str] = Field(default=None, max_length=150)
    phone: str = Field(min_length=5, max_length=30)
    subject: str = Field(min_length=1, max_length=200)
    messageType: Literal["complaint", "suggestion", "inquiry", "other"] = "complaint"
    message: str = Field(min_length=1, max_length=10000)

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_is_optional(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("office", mode="before")
    @classmethod
    def empty_office_is_optional(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("name", "phone", "subject", "message")
    @classmethod
    def strip_and_require_contact_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("هذا الحقل مطلوب")
        return value

    @field_validator("subject")
    @classmethod
    def prevent_subject_header_injection(cls, value):
        if "\r" in value or "\n" in value:
            raise ValueError("عنوان الرسالة غير صالح")
        return value


class MessageReplyIn(BaseModel):
    response: str = Field(min_length=1, max_length=10000)

    @field_validator("response")
    @classmethod
    def strip_and_require_response(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("الرد مطلوب")
        return value
