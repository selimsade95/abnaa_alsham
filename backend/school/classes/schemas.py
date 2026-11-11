from typing import List, Optional

from pydantic import BaseModel


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
