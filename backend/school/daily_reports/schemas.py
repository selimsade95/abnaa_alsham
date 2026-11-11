from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class DailyReportAbsenceIn(BaseModel):
    studentId: str
    absenceReason: Literal["excused", "unexcused"]
    excuseReason: Optional[str] = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_excuse_reason(self):
        reason = (self.excuseReason or "").strip()
        if self.absenceReason == "excused" and not reason:
            raise ValueError("An excuse reason is required for excused absences")
        self.excuseReason = reason if self.absenceReason == "excused" else None
        return self


class DailyReportSaveIn(BaseModel):
    classId: str
    reportDate: date
    absences: List[DailyReportAbsenceIn] = Field(default_factory=list)
    schoolFlow: str = Field(default="", max_length=10000)
    firstBreakNotes: str = Field(default="", max_length=10000)
    secondBreakNotes: str = Field(default="", max_length=10000)
    notes: str = Field(default="", max_length=10000)
