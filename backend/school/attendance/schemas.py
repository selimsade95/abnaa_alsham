from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class AttendanceRecordIn(BaseModel):
    studentId: str
    status: Literal["present", "absent", "early_dismissal", "truancy"]
    absenceReason: Optional[Literal["excused", "unexcused"]] = None
    lateMinutes: Optional[int] = Field(default=None, ge=1, le=1440)
    earlyDismissalReason: Optional[str] = Field(default=None, max_length=1000)
    earlyDismissalRelation: Optional[
        Literal["father", "mother", "relative", "guardian", "other"]
    ] = None
    earlyDismissalBy: Optional[str] = Field(default=None, max_length=160)


class AttendanceSaveIn(BaseModel):
    attendanceDate: date
    records: List[AttendanceRecordIn]
