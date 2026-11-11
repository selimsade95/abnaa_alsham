from typing import Optional

from pydantic import BaseModel


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
