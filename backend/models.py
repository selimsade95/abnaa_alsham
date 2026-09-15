"""Pydantic request models used by the API routes."""

from typing import List, Optional
from pydantic import BaseModel


class LoginIn(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    name: str
    username: str
    password: str
    roles: List[str] = []
    teacherId: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    roles: Optional[List[str]] = None
    teacherId: Optional[str] = None


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


class PaymentIn(BaseModel):
    student: str
    academicYear: str
    semester: str
    amount: float
    paymentDate: str
    notes: Optional[str] = ""


class RefundIn(BaseModel):
    student: str
    academicYear: str
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
