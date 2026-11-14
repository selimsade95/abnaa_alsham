# Backend structure

- `server.py` is the Uvicorn entry point.
- `school/app.py` wires up feature routers, audit middleware, and lifecycle hooks.
- Feature folders under `school/` own their route handlers and request schemas. For
  example, student records and documents live in `school/students/`, while payment
  routes and fee calculations live in `school/payments/`.
- `school/core/` holds the database connection, branch scoping, shared services,
  upload helpers, and startup work. The backend root still holds `.env` and the
  default uploads directory.
- `tests/` holds backend tests.

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

Daily statistics and shift reports are recorded once per class/division and
date through `GET /api/daily-reports/classes`,
`GET /api/daily-reports/{classId}`, `POST /api/daily-reports`, and
`PUT /api/daily-reports/{classId}`. The `dailyReports.view`,
`dailyReports.create`, `dailyReports.update`, and `dailyReports.print`
permissions control access; reports cannot be deleted. Absent student counts
are derived from the selected active students, and each absence requires an
excused/unexcused reason. Updates record the timestamp and user name.

Successful data-changing API requests are recorded in the read-only audit log.
Users need the `auditLogs.view` permission to view `GET /api/audit-logs`; results
are scoped to the active branch unless the user has `branches.accessAll`.
Entries include the method, path, status, actor, branch, and timestamp, but not
request bodies.

Dashboard and payment summaries exclude dropped students from payable totals by
default. Pass `includeDropped=true` to `GET /api/dashboard/stats` or
`GET /api/payments/summary` to include their payable fees.

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

## Private files and deployment

Keep the uploads directory outside any public web root or static-file mount.
The API checks the existing document permissions and the student's branch,
class, and applicable student scopes before serving a file. The public card
check displays no student photo.

Set `CORS_ORIGINS` to the frontend origins when hosting the frontend and API
on separate origins. Local development defaults to port 3000 on localhost.
Set `SEED_ADMIN_PASSWORD` before starting with an empty user database. For
existing installations, change any administrator password previously set to
the old default.

## Reading and recitation

Set up rating bands, mistake deductions, and custom books in **Recitation
settings** for the active branch. Each rating's minimum is inclusive.
Grant staff the existing role editor entries under Recitations to view, record,
publish, or configure sessions. Staff record a session from the student's
profile. Published sessions show page scores, mistakes, and notes in the
parent portal. Historical scores keep the rules used when the session was saved.

The checked-in Quran page ranges use the first and last verse pages for each
Juz from the [Quran Foundation Madani Mushaf layout](https://api-docs.quran.foundation/docs/tutorials/fonts/page-layout/).
Some boundary pages belong to both adjacent Juz and are scored once per session.

## Grade announcements

Grant `announcements.manage` to staff who should prepare and track WhatsApp
announcements for their active branch. Grant `announcements.configure` as
well to staff who maintain group invite links. Grades 1 and 2 use one
combined group each. Grades 3 through 9 have separate girls’ and boys’ groups.
The history stores the message and separate staff confirmations per group.
Confirm a group after posting in WhatsApp. The system does not send the
message or receive delivery receipts.

## Parent access on student cards

Staff with `students.print` and `students.parentAccess.manage` can enable,
replace, or revoke parent access from the student card print view. Verify the
guardian in person before handing over the printout. Print the student card
when enabling access, since the private code is only shown at issuance.
Replacing or revoking access disables both the old QR and its manual code.

The card QR opens the Arabic parent portal directly. Parents can also open
`/parent-access` and enter the private code printed on the student card.
Both methods show the child's recent attendance, grades published by
staff with `grades.accept`, and notes marked **Share with parent**. Existing
grades and notes start private unless explicitly shared.

## Branch and student access

On startup, existing records are assigned to a new default branch named
`الفرع الرئيسي`. Branch data is automatically isolated in API reads and writes.
Users are assigned one or more branches in the user editor; users with the
`branches.accessAll` permission can choose among every active branch at login
and switch branches from the application sidebar. The `branches.manage`
permission controls branch administration.

To restrict a sub-manager to one student gender, grant the role
`students.gender.male.view` or `students.gender.female.view` alongside the
required student permissions. These restrictions also apply to linked
payments, grades, homework, and attendance records. Roles without either
gender permission retain their existing unrestricted behavior.

For schools with mixed lower grades and gender-separated upper grades, use
grade-and-gender scopes instead of a single gender permission. Grant
`students.scope.lowerGrades.view` to show boys and girls in grades 1–2,
`students.scope.upperGrades.male.view` for boys in grades 3–9, and
`students.scope.upperGrades.female.view` for girls in grades 3–9. Combine
scopes on a role as needed: for example, a female manager receives the lower
grades and upper-female scopes; a male manager receives the upper-male scope.
The same scope applies to student-linked records and class lists, and prevents
creating or moving students outside the assigned grade/gender scope. Ensure
each class has a recognizable grade value in its `grade` field (numeric grades,
Arabic digits, and common Arabic or English ordinal names are supported);
unrecognized grade values are excluded from scoped access.
