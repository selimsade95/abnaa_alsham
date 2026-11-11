from typing import Optional

from pydantic import BaseModel


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
