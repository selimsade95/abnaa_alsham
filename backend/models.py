"""Pydantic request models used by the API routes."""

from datetime import date
from typing import List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginIn(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    name: str
    username: str
    password: str
    roles: List[str] = []
    teacherId: Optional[str] = None
    branchIds: Optional[List[str]] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    roles: Optional[List[str]] = None
    teacherId: Optional[str] = None
    branchIds: Optional[List[str]] = None


class BranchIn(BaseModel):
    name: str
    active: bool = True


class SelectBranchIn(BaseModel):
    branchId: str


class RoleIn(BaseModel):
    name: str
    description: Optional[str] = ""
    permissions: List[str] = []


class StudentIn(BaseModel):
    student: dict
    siblings: List[dict] = []
    father: dict = {}
    mother: dict = {}
    general: dict = {}
    previousEducation: List[dict] = []
    islamicLegalEducation: Optional[str] = ""
    bestAchievement: Optional[str] = ""
    otherInfo: dict = {}
    signing: dict = {}
    fees: dict = {}
    initialPayment: Optional[dict] = None
    fullInfo: dict = {}
    currentClassId: Optional[str] = None


class StudentNoteIn(BaseModel):
    content: str


class HomeworkIn(BaseModel):
    classId: str
    subjectId: str
    studentIds: List[str] = Field(min_length=1)


class AttendanceRecordIn(BaseModel):
    studentId: str
    status: Literal["present", "absent"]
    absenceReason: Optional[Literal["excused", "unexcused"]] = None
    lateMinutes: Optional[int] = Field(default=None, ge=1, le=1440)


class AttendanceSaveIn(BaseModel):
    attendanceDate: date
    records: List[AttendanceRecordIn]


class RegistrationPathsIn(BaseModel):
    paths: List[str]


class DiscountOptionIn(BaseModel):
    name: str
    percentage: float
    category: Literal["general", "siblings_staff"] = "general"


class DiscountOptionsIn(BaseModel):
    options: List[DiscountOptionIn]


class PaymentIn(BaseModel):
    student: str
    academicYear: str
    feeType: str = "academic"
    semester: str
    amount: float
    paymentDate: str
    notes: Optional[str] = ""


class PaymentAllocationIn(BaseModel):
    student: str
    amount: float


class PaymentSplitIn(BaseModel):
    academicYear: str
    feeType: str = "academic"
    semester: str
    totalAmount: float
    allocations: List[PaymentAllocationIn] = Field(min_length=1)
    paymentDate: str
    notes: Optional[str] = ""


class RefundIn(BaseModel):
    student: str
    academicYear: str
    feeType: str = "academic"
    semester: str
    amount: float
    paymentDate: str
    notes: Optional[str] = ""


class TeacherIn(BaseModel):
    fullName: str
    gender: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    specialization: Optional[str] = ""
    qualification: Optional[str] = ""
    employmentStatus: Optional[str] = "active"
    notes: Optional[str] = ""
    fatherName: Optional[str] = ""
    motherName: Optional[str] = ""
    birthPlace: Optional[str] = ""
    birthDate: Optional[str] = ""
    idNumber: Optional[str] = ""
    martialStatus: Optional[str] = ""
    maleChildrenCount: Optional[str] = ""
    femaleChildrenCount: Optional[str] = ""
    workStartDate: Optional[str] = ""
    department: Optional[str] = ""
    office: Optional[str] = ""
    education: Optional[str] = ""
    volunteer: Optional[str] = ""
    jobDescription: Optional[str] = ""
    skills: Optional[str] = ""
    contactPhone: Optional[str] = ""
    certificate: Optional[str] = ""


class ClassIn(BaseModel):
    name: str
    grade: Optional[str] = ""
    section: Optional[str] = ""
    academicYear: Optional[str] = ""
    teacherId: Optional[str] = None
    teacherIds: List[str] = []
    capacity: Optional[int] = 0
    status: Optional[str] = "active"
    notes: Optional[str] = ""


class ClassPromotionStudentIn(BaseModel):
    studentId: str
    totalPayable: float


class ClassPromotionIn(BaseModel):
    destinationClassId: str
    students: List[ClassPromotionStudentIn]


class DeactivationIn(BaseModel):
    reason: str


class CodeSettingsIn(BaseModel):
    students: dict
    teachers: dict
    classes: dict
    resetYearly: bool = True


class SubjectIn(BaseModel):
    name: str
    code: Optional[str] = ""
    status: Optional[str] = "active"
    notes: Optional[str] = ""


class TeacherSubjectIn(BaseModel):
    teacherId: str
    subjectId: str


class ClassSubjectIn(BaseModel):
    classId: str
    subjectId: str
    teacherIds: List[str] = []


class GradeIn(BaseModel):
    studentId: str
    classId: str
    subjectId: str
    academicYear: str
    period: str
    score: float
    notes: Optional[str] = ""


class GradeSettingsIn(BaseModel):
    accepting: bool = False


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
