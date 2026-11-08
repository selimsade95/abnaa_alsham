import pytest
from pydantic import ValidationError

from models import AttendanceRecordIn, DailyReportAbsenceIn


def test_attendance_records_support_early_dismissal_and_truancy():
    early_dismissal = AttendanceRecordIn(
        studentId="student-1",
        status="early_dismissal",
        earlyDismissalReason="Medical appointment",
        earlyDismissalRelation="mother",
        earlyDismissalBy="Parent name",
    )
    truancy = AttendanceRecordIn(studentId="student-2", status="truancy")

    assert early_dismissal.earlyDismissalRelation == "mother"
    assert truancy.status == "truancy"

    with pytest.raises(ValidationError):
        AttendanceRecordIn(studentId="student-3", status="skipped")


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
