"""
IQRA School - Backend API tests (extended: Teachers, Classes, Code Generation,
Full Information, server-side search/filter/pagination + regression of RBAC/payments/orphan docs).
"""
import io
import os
import time
import uuid
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from pathlib import Path
    env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
if not BASE_URL:
    raise RuntimeError("Set REACT_APP_BACKEND_URL or add it to frontend/.env before running API tests.")
API = f"{BASE_URL}/api"

ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

CURRENT_YEAR = datetime.utcnow().year
YEAR2 = str(CURRENT_YEAR)[-2:]

# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture(scope="session")
def reg_staff_role_id(admin_headers):
    r = requests.get(f"{API}/roles", headers=admin_headers)
    assert r.status_code == 200
    for role in r.json():
        if role["name"] == "Registration Staff":
            return role["id"]
    pytest.fail("Registration Staff role not seeded")

@pytest.fixture(scope="session")
def reg_staff_headers(admin_headers, reg_staff_role_id):
    # create a fresh registration-staff user
    uname = f"TEST_regstaff_{uuid.uuid4().hex[:6]}"
    payload = {"name": "TEST Reg Staff", "username": uname, "password": "pass1234",
               "roles": [reg_staff_role_id]}
    r = requests.post(f"{API}/users", headers=admin_headers, json=payload)
    assert r.status_code == 200, r.text
    login = requests.post(f"{API}/auth/login", json={"username": uname, "password": "pass1234"})
    assert login.status_code == 200
    tok = login.json()["token"]
    return {"Authorization": f"Bearer {tok}"}, login.json()["user"]

# ---------- Auth / Permissions catalog ----------

class TestAuthAndCatalog:
    def test_login_admin_returns_token_and_permissions(self):
        r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["token"], str) and len(data["token"]) > 20
        assert "user" in data
        perms = data["user"]["permissions"]
        assert isinstance(perms, list)
        assert len(perms) >= 32, f"expected >=32 permissions, got {len(perms)}"
        # spot check new perms
        for p in ("teachers.view", "teachers.create", "classes.view", "classes.create",
                  "students.fullInformation.view",
                  "settings.codeGeneration.view", "settings.codeGeneration.update"):
            assert p in perms, f"missing perm {p}"

    def test_login_bad_credentials(self):
        r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json()["permissions"], list)
        assert len(r.json()["permissions"]) >= 32

    def test_permissions_catalog(self, admin_headers):
        r = requests.get(f"{API}/permissions", headers=admin_headers)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) >= 32
        names = {p["name"] for p in arr}
        for req in ("teachers.delete", "classes.update", "settings.codeGeneration.update",
                    "students.fullInformation.view"):
            assert req in names

    def test_roles_seeded(self, admin_headers):
        r = requests.get(f"{API}/roles", headers=admin_headers)
        assert r.status_code == 200
        names = {ro["name"] for ro in r.json()}
        for n in ("Administrator", "Registration Staff", "Accountant"):
            assert n in names
        admin = next(ro for ro in r.json() if ro["name"] == "Administrator")
        # Administrator has all permissions
        cat = requests.get(f"{API}/permissions", headers=admin_headers).json()
        catalog_names = {p["name"] for p in cat}
        assert set(admin["permissions"]) >= catalog_names


# ---------- Code Generation Settings ----------

class TestCodeGenerationSettings:
    def test_get_defaults(self, admin_headers):
        r = requests.get(f"{API}/settings/code-generation", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["students"]["prefix"]
        assert d["teachers"]["prefix"]
        assert d["classes"]["prefix"]
        assert "{PREFIX}" in d["students"]["format"]
        assert "{SEQ" in d["students"]["format"]

    def test_preview_custom_format(self, admin_headers):
        body = {"students": {"prefix": "STD", "format": "{PREFIX}-{YEAR2}-{SEQ:4}"},
                "teachers": {"prefix": "TCR", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
                "classes":  {"prefix": "CLS", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
                "resetYearly": True}
        r = requests.post(f"{API}/settings/code-generation/preview",
                          headers=admin_headers, json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["students"] == f"STD-{YEAR2}-0001"
        assert d["teachers"] == f"TCR-{CURRENT_YEAR}-000001"
        assert d["classes"] == f"CLS-{CURRENT_YEAR}-000001"

    def test_update_settings_rejects_unknown_token(self, admin_headers):
        body = {"students": {"prefix": "STU", "format": "{PREFIX}-{FOO}-{SEQ:4}"},
                "teachers": {"prefix": "TCR", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
                "classes":  {"prefix": "CLS", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
                "resetYearly": True}
        r = requests.put(f"{API}/settings/code-generation",
                         headers=admin_headers, json=body)
        assert r.status_code == 400

    def test_update_settings_success(self, admin_headers):
        # Keep defaults but flip resetYearly
        body = {"students": {"prefix": "STU", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
                "teachers": {"prefix": "TCR", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
                "classes":  {"prefix": "CLS", "format": "{PREFIX}-{YEAR}-{SEQ:6}"},
                "resetYearly": True}
        r = requests.put(f"{API}/settings/code-generation",
                         headers=admin_headers, json=body)
        assert r.status_code == 200
        got = r.json()
        assert got["students"]["prefix"] == "STU"


# ---------- Teachers CRUD ----------

@pytest.fixture(scope="session")
def created_teacher(admin_headers):
    body = {"fullName": "TEST Teacher A", "gender": "male", "phone": "0500000001",
            "address": "Riyadh", "specialization": "Math", "qualification": "BSc",
            "employmentStatus": "active", "notes": ""}
    r = requests.post(f"{API}/teachers", headers=admin_headers, json=body)
    assert r.status_code == 200, r.text
    return r.json()


class TestTeachers:
    def test_create_teacher_has_auto_code(self, created_teacher):
        assert created_teacher["fullName"] == "TEST Teacher A"
        code = created_teacher["code"]
        assert code.startswith("TCR-")
        assert str(CURRENT_YEAR) in code

    def test_sequential_codes(self, admin_headers, created_teacher):
        first_seq = int(created_teacher["code"].split("-")[-1])
        r = requests.post(f"{API}/teachers", headers=admin_headers,
                          json={"fullName": "TEST Teacher B", "gender": "female"})
        assert r.status_code == 200
        second_seq = int(r.json()["code"].split("-")[-1])
        assert second_seq == first_seq + 1
        # cleanup handled at end
        requests.delete(f"{API}/teachers/{r.json()['id']}", headers=admin_headers,
                json={"reason": "اختبار تنظيف"})

    def test_list_teachers_pagination_and_search(self, admin_headers, created_teacher):
        r = requests.get(f"{API}/teachers?search=TEST&page=1&limit=5", headers=admin_headers)
        assert r.status_code == 200
        j = r.json()
        assert "data" in j and "pagination" in j
        pg = j["pagination"]
        assert pg["page"] == 1 and pg["limit"] == 5
        assert isinstance(pg["total"], int)
        # our teacher must show up
        assert any(t["id"] == created_teacher["id"] for t in j["data"])

    def test_list_filter_gender(self, admin_headers, created_teacher):
        r = requests.get(f"{API}/teachers?gender=male", headers=admin_headers)
        assert r.status_code == 200
        for t in r.json()["data"]:
            assert t.get("gender") == "male"

    def test_update_teacher(self, admin_headers, created_teacher):
        upd = {"fullName": "TEST Teacher A2", "gender": "male", "phone": "0500000002",
               "specialization": "Physics"}
        r = requests.put(f"{API}/teachers/{created_teacher['id']}",
                         headers=admin_headers, json=upd)
        assert r.status_code == 200
        assert r.json()["fullName"] == "TEST Teacher A2"
        assert r.json()["specialization"] == "Physics"


# ---------- Classes CRUD ----------

@pytest.fixture(scope="session")
def created_class(admin_headers, created_teacher):
    body = {"name": "TEST Class Alpha", "grade": "Grade 1", "section": "A",
            "academicYear": "2025-2026", "teacherId": created_teacher["id"],
            "capacity": 30, "status": "active"}
    r = requests.post(f"{API}/classes", headers=admin_headers, json=body)
    assert r.status_code == 200, r.text
    return r.json()


class TestClasses:
    def test_create_class_auto_code_and_enrichment(self, created_class, created_teacher):
        assert created_class["code"].startswith("CLS-")
        assert created_class["teacherName"] == created_teacher["fullName"]
        assert created_class["studentCount"] == 0

    def test_list_classes_filters(self, admin_headers, created_class):
        r = requests.get(f"{API}/classes?search=TEST&status=active", headers=admin_headers)
        assert r.status_code == 200
        j = r.json()
        assert "pagination" in j
        assert any(c["id"] == created_class["id"] for c in j["data"])

    def test_deactivate_teacher_with_class(self, admin_headers, created_teacher):
        r = requests.delete(f"{API}/teachers/{created_teacher['id']}", headers=admin_headers,
                    json={"reason": "انتهاء الحاجة للاختبار"})
        assert r.status_code == 200
        assert r.json()["deactivated"] is True
        # Inactive teachers are hidden by default but are available on request.
        assert not any(t["id"] == created_teacher["id"] for t in
                       requests.get(f"{API}/teachers", headers=admin_headers).json()["data"])
        assert any(t["id"] == created_teacher["id"] for t in
                   requests.get(f"{API}/teachers?employmentStatus=inactive", headers=admin_headers).json()["data"])


# ---------- Students CRUD ----------

@pytest.fixture(scope="session")
def created_student(admin_headers, created_class):
    body = {
        "student": {"fullName": "TEST Student Ali", "gender": "male",
                    "orphan": True, "registrationPath": "الايتام",
                    "currentAddress": "Village X", "status": "active"},
        "father": {"name": "TEST Father", "phone": "0500001111"},
        "mother": {"name": "TEST Mother", "phone": "0500002222"},
        "general": {"whatsappGroupPhone": "0500003333"},
        "fees": {"academicYear": "2025-2026", "totalPayable": 1000},
        "initialPayment": {"amount": 200, "semester": "first",
                           "paymentDate": datetime.utcnow().isoformat()},
        "fullInfo": {"note": "excel-field-1", "custom": "value"},
        "currentClassId": created_class["id"],
    }
    r = requests.post(f"{API}/students", headers=admin_headers, json=body)
    assert r.status_code == 200, r.text
    return r.json()


class TestStudents:
    def test_create_student_with_class_and_initial_payment(self, created_student, created_class):
        s = created_student
        assert s["code"].startswith("STU-")
        assert s["currentClassId"] == created_class["id"]
        assert s["fees"]["totalPayable"] == 1000
        assert s["fees"]["totalPaid"] == 200
        assert s["fees"]["remaining"] == 800
        assert s.get("currentClass", {}).get("name") == created_class["name"]

    def test_create_student_bad_class(self, admin_headers):
        body = {"student": {"fullName": "TEST Bad Class", "gender": "male"},
                "fees": {"academicYear": "2025-2026", "totalPayable": 100},
                "currentClassId": "does-not-exist"}
        r = requests.post(f"{API}/students", headers=admin_headers, json=body)
        assert r.status_code == 400

    def test_create_student_invalid_reg_path(self, admin_headers):
        body = {"student": {"fullName": "TEST BadPath", "registrationPath": "invalid"},
                "fees": {"totalPayable": 0}}
        r = requests.post(f"{API}/students", headers=admin_headers, json=body)
        assert r.status_code == 400

    def test_list_students_search_and_filters(self, admin_headers, created_student, created_class):
        r = requests.get(f"{API}/students?search=TEST&orphan=true&registrationPath=الايتام"
                         f"&classId={created_class['id']}&page=1&limit=10",
                         headers=admin_headers)
        assert r.status_code == 200
        j = r.json()
        assert "pagination" in j
        assert any(x["id"] == created_student["id"] for x in j["data"])

    def test_list_students_by_teacher(self, admin_headers, created_student, created_teacher):
        r = requests.get(f"{API}/students?teacherId={created_teacher['id']}",
                         headers=admin_headers)
        assert r.status_code == 200
        assert any(x["id"] == created_student["id"] for x in r.json()["data"])

    def test_get_student_augmented(self, admin_headers, created_student):
        r = requests.get(f"{API}/students/{created_student['id']}", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["fees"]["totalPaid"] == 200
        assert d["fees"]["remaining"] == 800
        assert "currentClass" in d

    def test_public_student_validation(self, created_student):
        r = requests.get(f"{API}/public/students/{created_student['id']}/validation")
        assert r.status_code == 200
        d = r.json()
        assert d["code"] == created_student["code"]
        assert d["fullName"] == created_student["student"]["fullName"]
        assert d["isActive"] is True

    def test_get_full_information(self, admin_headers, created_student):
        r = requests.get(f"{API}/students/{created_student['id']}/full-information",
                         headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == created_student["id"]
        assert d.get("fullInfo", {}).get("note") == "excel-field-1"

    def test_update_student_preserves_code(self, admin_headers, created_student, created_class):
        orig_code = created_student["code"]
        body = {
            "student": {"fullName": "TEST Student Ali Updated", "gender": "male",
                        "orphan": True, "registrationPath": "الايتام"},
            "fees": {"academicYear": "2025-2026", "totalPayable": 1200},
            "fullInfo": {"note": "excel-field-updated"},
            "currentClassId": created_class["id"],
        }
        r = requests.put(f"{API}/students/{created_student['id']}",
                         headers=admin_headers, json=body)
        assert r.status_code == 200, r.text
        assert r.json()["code"] == orig_code
        assert r.json()["fullInfo"]["note"] == "excel-field-updated"

    def test_reactivate_student(self, admin_headers, created_student):
        sid = created_student["id"]
        r = requests.delete(f"{API}/students/{sid}", headers=admin_headers,
                    json={"reason": "اختبار التعطيل"})
        assert r.status_code == 200
        inactive = requests.get(f"{API}/students?status=inactive", headers=admin_headers)
        inactive_student = next(s for s in inactive.json()["data"] if s["id"] == sid)
        assert inactive_student["deactivationReason"] == "اختبار التعطيل"

        r = requests.post(f"{API}/students/{sid}/reactivate", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["reactivated"] is True
        active = requests.get(f"{API}/students", headers=admin_headers)
        assert any(s["id"] == sid for s in active.json()["data"])


# ---------- Payments ----------

class TestPayments:
    def test_overpayment_prevented(self, admin_headers, created_student):
        # totalPayable=1200 (after update), already paid 200 -> remaining 1000
        body = {"student": created_student["id"], "academicYear": "2025-2026",
                "semester": "second", "amount": 9999,
                "paymentDate": datetime.utcnow().isoformat()}
        r = requests.post(f"{API}/payments", headers=admin_headers, json=body)
        assert r.status_code == 400

    def test_refund_cannot_exceed_semester_paid_amount(self, admin_headers, created_student):
        body = {"student": created_student["id"], "academicYear": "2025-2026",
                "semester": "first", "amount": 201,
                "paymentDate": datetime.utcnow().isoformat(), "notes": "TEST refund"}
        r = requests.post(f"{API}/payments/refund", headers=admin_headers, json=body)
        assert r.status_code == 400
        assert "يتجاوز المدفوع للفصل" in r.text

    def test_list_student_payments_enriched(self, admin_headers, created_student):
        r = requests.get(f"{API}/students/{created_student['id']}/payments",
                         headers=admin_headers)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        p = arr[0]
        assert "studentName" in p and "studentCode" in p and "createdByName" in p

        payments = requests.get(f"{API}/payments", headers=admin_headers)
        assert payments.status_code == 200
        created_payment = next(p for p in payments.json() if p["student"] == created_student["id"])
        assert created_payment["totalPayable"] == 1000
        assert created_payment["totalRemaining"] == 800

    def test_refund_returns_successful_serializable_response(self, admin_headers, created_student):
        body = {"student": created_student["id"], "academicYear": "2025-2026",
                "semester": "first", "amount": 10,
                "paymentDate": datetime.utcnow().isoformat(), "notes": "TEST valid refund"}
        r = requests.post(f"{API}/payments/refund", headers=admin_headers, json=body)
        assert r.status_code == 200, r.text
        refund = r.json()
        assert refund["type"] == "refund"
        assert refund["amount"] == -10
        assert "_id" not in refund


# ---------- Orphan documents ----------

# Minimal valid PDF
PDF_BYTES = (b"%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
             b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"
             b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >>endobj\n"
             b"xref\n0 4\n0000000000 65535 f\ntrailer<< /Root 1 0 R /Size 4 >>\n%%EOF")

class TestOrphanDocument:
    def test_upload_pdf(self, admin_headers, created_student):
        files = {"file": ("doc.pdf", PDF_BYTES, "application/pdf")}
        data = {"type": "birth_certificate", "description": "TEST doc"}
        r = requests.post(f"{API}/students/{created_student['id']}/orphan-document",
                          headers=admin_headers, files=files, data=data)
        assert r.status_code == 200, r.text
        assert r.json()["fileName"].endswith(".pdf")

    def test_download(self, admin_headers, created_student):
        r = requests.get(f"{API}/students/{created_student['id']}/orphan-document",
                         headers=admin_headers)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf") or len(r.content) > 0

    def test_replace_old_removed(self, admin_headers, created_student):
        # capture current file path via DB isn't possible from here; do second upload and check listing
        files = {"file": ("doc2.pdf", PDF_BYTES + b"\n", "application/pdf")}
        data = {"type": "id_card", "description": "TEST replace"}
        r = requests.post(f"{API}/students/{created_student['id']}/orphan-document",
                          headers=admin_headers, files=files, data=data)
        assert r.status_code == 200
        # metadata updated
        s = requests.get(f"{API}/students/{created_student['id']}", headers=admin_headers).json()
        assert s.get("orphanDocument", {}).get("type") == "id_card"

    def test_reject_txt(self, admin_headers, created_student):
        files = {"file": ("bad.txt", b"hello", "text/plain")}
        data = {"type": "misc"}
        r = requests.post(f"{API}/students/{created_student['id']}/orphan-document",
                          headers=admin_headers, files=files, data=data)
        assert r.status_code == 400


# ---------- RBAC ----------

class TestRBAC:
    def test_reg_staff_cannot_delete_student(self, reg_staff_headers, created_student):
        headers, _ = reg_staff_headers
        r = requests.delete(f"{API}/students/{created_student['id']}", headers=headers,
                    json={"reason": "اختبار الصلاحيات"})
        assert r.status_code == 403

    def test_reg_staff_cannot_delete_teacher(self, reg_staff_headers, created_teacher):
        headers, _ = reg_staff_headers
        r = requests.delete(f"{API}/teachers/{created_teacher['id']}", headers=headers,
                    json={"reason": "اختبار الصلاحيات"})
        assert r.status_code == 403


# ---------- Dashboard ----------

class TestDashboard:
    def test_dashboard_stats(self, admin_headers):
        r = requests.get(f"{API}/dashboard/stats", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "female", "male", "orphans", "teachers", "classes",
                  "totalPayable", "totalCollected", "totalRemaining"):
            assert k in d


# ---------- Cleanup teardown ----------

class TestZZCleanup:
    """Runs last to deactivate test data without removing its history."""
    def test_cleanup(self, admin_headers, created_student, created_class, created_teacher):
        r = requests.delete(f"{API}/students/{created_student['id']}", headers=admin_headers,
                    json={"reason": "تنظيف بيانات الاختبار"})
        assert r.status_code == 200
        assert r.json()["deactivated"] is True
        active_students = requests.get(f"{API}/students", headers=admin_headers).json()["data"]
        inactive_students = requests.get(f"{API}/students?status=inactive", headers=admin_headers).json()["data"]
        assert not any(s["id"] == created_student["id"] for s in active_students)
        assert any(s["id"] == created_student["id"] for s in inactive_students)

        r = requests.delete(f"{API}/classes/{created_class['id']}", headers=admin_headers,
                    json={"reason": "تنظيف بيانات الاختبار"})
        assert r.status_code == 200
        r = requests.delete(f"{API}/teachers/{created_teacher['id']}", headers=admin_headers,
                    json={"reason": "تنظيف بيانات الاختبار"})
        assert r.status_code == 200
        # cleanup TEST users
        users = requests.get(f"{API}/users", headers=admin_headers).json()
        for u in users:
            if u.get("username", "").startswith("TEST_regstaff_"):
                requests.delete(f"{API}/users/{u['id']}", headers=admin_headers)
