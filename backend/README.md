# Backend structure

- `server.py`: application entry point. Keep this file limited to bootstrapping.
- `routes.py`: current FastAPI registration module and startup registration.
- `models.py`: shared Pydantic request models.
- `services.py`: shared authentication, permission checks, access scopes, and code generation.
- `studentModel.py` / `studentService.py` / `studentRoute.py`: student domain boundary.
- `teacherModel.py` / `teacherService.py` / `teacherRoute.py`: teacher domain boundary.
- `classModel.py` / `classService.py` / `classRoute.py`: class domain boundary.
- `paymentModel.py` / `paymentService.py` / `paymentRoute.py`: payment domain boundary.
- `authModel.py` / `authService.py` / `authRoute.py`: auth, roles, and users boundary.

The `*Route.py` modules currently export the tested handlers from `routes.py`.
This keeps the API stable while allowing each domain to be migrated out of the
legacy registration module independently without a risky all-at-once rewrite.

The homework workflow uses `GET /api/classes/{classId}/homework-options` and
`POST /api/homework` for recording undone work, and `GET /api/homework` for
viewing outstanding records. It requires the `homework.create` and
`homework.view` permissions respectively. Recording an item also adds a
teacher-authored class note to the student's details.

Attendance is recorded once per class and date through
`GET /api/attendance/classes/{classId}` and
`PUT /api/attendance/classes/{classId}`. Attendance sessions have a unique
class/date key; repeated absences on three or more distinct dates appear in
`GET /api/attendance/reports`. These endpoints use the `attendance.view`,
`attendance.manage`, and `attendance.reports.view` permissions. Printing
reports is controlled by `attendance.reports.print`. Absence records require
an excused/unexcused reason; present students may optionally have a late
duration recorded in minutes.

Run the API from this directory with:

```text
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The verification-message reply feature sends email through the Resend API.
Set `RESEND_API_KEY` in the backend `.env` file and set `MAIL_FROM` to an email
address on a domain verified with Resend.

The standalone public contact form at `/contact` saves submissions in the
separate `contact_messages` collection and emails them through the same Resend
API key. Set `MAIL_FROM_CONTACT` to a sender address on a domain verified with
Resend and `CONTACT_EMAILS` to a comma-separated list of one to five recipient
addresses. The first address is the primary recipient and the remaining
addresses are copied (CC).
