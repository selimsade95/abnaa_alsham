import logging
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.body_limit import RequestBodyLimitMiddleware

from school.attendance.routes import router as attendance_router
from school.announcements.routes import router as announcements_router
from school.audit.middleware import audit_data_changes
from school.audit.routes import router as audit_router
from school.auth.routes import router as auth_router
from school.branches.routes import router as branches_router
from school.classes.routes import router as classes_router
from school.core.lifecycle import on_shutdown, on_startup
from school.core.search import router as search_router
from school.core.database import MAX_UPLOAD_BYTES
from school.daily_reports.routes import router as daily_reports_router
from school.dashboard.filters import router as dashboard_filters_router
from school.dashboard.routes import router as dashboard_router
from school.grades.routes import router as grades_router
from school.homework.routes import router as homework_router
from school.messages.routes import router as messages_router
from school.parent_access.routes import router as parent_access_router
from school.payments.routes import router as payments_router
from school.recitations.routes import router as recitations_router
from school.reports.financial import router as financial_reports_router
from school.reports.routes import router as reports_router
from school.roles.routes import router as roles_router
from school.settings.routes import router as settings_router
from school.students.documents import router as student_documents_router
from school.students.records import router as student_records_router
from school.students.routes import router as students_router
from school.subjects.routes import router as subjects_router
from school.teachers.routes import router as teachers_router
from school.users.routes import router as users_router


@asynccontextmanager
async def lifespan(app):
    try:
        await on_startup()
        yield
    finally:
        await on_shutdown()


app = FastAPI(title="IQRA School API", lifespan=lifespan)
app.middleware("http")(audit_data_changes)
app.add_middleware(RequestBodyLimitMiddleware, max_body_size=MAX_UPLOAD_BYTES + 1024 * 1024)

# FastAPI takes the first match. Keep this order so literal paths get their turn.
for router in (
    auth_router,
    audit_router,
    branches_router,
    roles_router,
    users_router,
    teachers_router,
    subjects_router,
    classes_router,
    homework_router,
    students_router,
    messages_router,
    announcements_router,
    search_router,
    parent_access_router,
    student_records_router,
    grades_router,
    student_documents_router,
    payments_router,
    recitations_router,
    settings_router,
    dashboard_filters_router,
    daily_reports_router,
    attendance_router,
    dashboard_router,
    reports_router,
    financial_reports_router,
):
    app.include_router(router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO)

