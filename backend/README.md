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

Run the API from this directory with:

```text
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The verification-message reply feature sends mail with Nodemailer. Install its
runtime dependency from this directory with `npm install`, then configure
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, and (optionally) `MAIL_FROM` in the backend
`.env` file. For Google Workspace, use a dedicated mailbox and an App Password
when the account has 2-Step Verification enabled. SMTP defaults to
`smtp.gmail.com:465`; override it with `SMTP_HOST`, `SMTP_PORT`, and
`SMTP_SECURE` if your Workspace configuration requires another connection
mode. The backend process must have Node.js available on `PATH` (or set
`NODE_BIN`). See `.env.example` for the variables.
