import pytest
from pydantic import ValidationError

from models import DailyReportAbsenceIn


def test_excused_absence_requires_a_reason():
    with pytest.raises(ValidationError):
        DailyReportAbsenceIn(studentId="student-1", absenceReason="excused")

    with pytest.raises(ValidationError):
        DailyReportAbsenceIn(
            studentId="student-1",
            absenceReason="excused",
            excuseReason="   ",
        )


def test_excuse_reason_is_trimmed_and_only_saved_for_excused_absence():
    excused = DailyReportAbsenceIn(
        studentId="student-1",
        absenceReason="excused",
        excuseReason="  Doctor appointment  ",
    )
    unexcused = DailyReportAbsenceIn(
        studentId="student-2",
        absenceReason="unexcused",
        excuseReason="Not required",
    )

    assert excused.excuseReason == "Doctor appointment"
    assert unexcused.excuseReason is None
