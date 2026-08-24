from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', '24'))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="IQRA School API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ----------------- Helpers -----------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_token(user_id: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail="غير مصرح")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(status_code=401, detail="مستخدم غير موجود")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت الجلسة، الرجاء تسجيل الدخول من جديد")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="رمز غير صالح")

# ----------------- Models -----------------

class LoginIn(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    username: str
    createdAt: str

class UserCreate(BaseModel):
    name: str
    username: str
    password: str

class AddressCodes(BaseModel):
    sector: Optional[str] = ""
    block: Optional[str] = ""
    minutes: Optional[str] = ""
    floor: Optional[str] = ""
    apartment: Optional[str] = ""

class StudentInfo(BaseModel):
    orphan: bool = False
    orphanOf: Optional[str] = ""
    previousClass: Optional[str] = ""
    newClass: str
    status: str
    fullName: str
    birthdate: str  # ISO date string
    birthPlace: Optional[str] = ""
    currentAddress: Optional[str] = ""
    gender: str  # "male" | "female"
    languages: List[str] = []
    hobbies: List[str] = []
    addressCodes: AddressCodes = AddressCodes()
    chronicDisease: bool = False
    chronicDiseaseDetails: Optional[str] = ""
    permanentHabits: bool = False
    permanentHabitsDetails: Optional[str] = ""

class Sibling(BaseModel):
    order: int
    fullName: Optional[str] = ""
    gender: Optional[str] = ""
    klass: Optional[str] = Field(default="", alias="class")
    model_config = {"populate_by_name": True}

class Parent(BaseModel):
    name: Optional[str] = ""
    alive: bool = True
    phone: Optional[str] = ""
    address: Optional[str] = ""
    profession: Optional[str] = ""
    whatsapp: Optional[str] = ""
    telegram: Optional[str] = ""

class EmergencyContact(BaseModel):
    name: Optional[str] = ""
    relation: Optional[str] = ""
    phone: Optional[str] = ""

class GeneralInfo(BaseModel):
    whatsappGroupPhone: Optional[str] = ""
    emergencyContact: EmergencyContact = EmergencyContact()

class PreviousEducationEntry(BaseModel):
    classes: Optional[str] = ""
    schoolName: Optional[str] = ""
    startingDate: Optional[str] = ""
    endingDate: Optional[str] = ""
    results: Optional[str] = ""

class OtherInfo(BaseModel):
    familySmokers: bool = False
    transportation: Optional[str] = ""
    notes: Optional[str] = ""

class Signing(BaseModel):
    parentName: Optional[str] = ""
    relationToStudent: Optional[str] = ""

class StudentIn(BaseModel):
    student: StudentInfo
    siblings: List[Sibling] = []
    father: Parent = Parent()
    mother: Parent = Parent()
    general: GeneralInfo = GeneralInfo()
    previousEducation: List[PreviousEducationEntry] = []
    islamicLegalEducation: Optional[str] = ""
    bestAchievement: Optional[str] = ""
    otherInfo: OtherInfo = OtherInfo()
    signing: Signing = Signing()

# ----------------- Auth Endpoints -----------------

@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"username": body.username})
    if not user or not verify_password(body.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="اسم المستخدم أو كلمة المرور غير صحيحة")
    token = create_token(user["id"], user["username"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "username": user["username"],
            "createdAt": user["createdAt"],
        },
    }

@api.post("/auth/logout")
async def logout(current=Depends(get_current_user)):
    return {"ok": True}

@api.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return current

# ----------------- Users -----------------

@api.get("/users", response_model=List[UserOut])
async def list_users(current=Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).sort("createdAt", -1).to_list(1000)
    return users

@api.post("/users", response_model=UserOut)
async def create_user(body: UserCreate, current=Depends(get_current_user)):
    if not body.name.strip() or not body.username.strip() or len(body.password) < 4:
        raise HTTPException(status_code=400, detail="بيانات غير صالحة")
    exists = await db.users.find_one({"username": body.username})
    if exists:
        raise HTTPException(status_code=400, detail="اسم المستخدم مستخدم من قبل")
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "username": body.username.strip(),
        "password": hash_password(body.password),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("password", None)
    doc.pop("_id", None)
    return doc

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, current=Depends(get_current_user)):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الحالي")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return {"ok": True}

# ----------------- Students -----------------

def _serialize_student(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc

@api.get("/students")
async def list_students(search: Optional[str] = None, current=Depends(get_current_user)):
    query: dict = {}
    if search:
        query = {"student.fullName": {"$regex": search, "$options": "i"}}
    docs = await db.students.find(query, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return docs

@api.get("/students/{sid}")
async def get_student(sid: str, current=Depends(get_current_user)):
    doc = await db.students.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    return doc

@api.post("/students")
async def create_student(body: StudentIn, current=Depends(get_current_user)):
    payload = body.model_dump(by_alias=True)
    # ensure sibling class key
    payload["id"] = str(uuid.uuid4())
    payload["createdAt"] = now_iso()
    payload["updatedAt"] = now_iso()
    await db.students.insert_one(payload)
    payload.pop("_id", None)
    return payload

@api.put("/students/{sid}")
async def update_student(sid: str, body: StudentIn, current=Depends(get_current_user)):
    existing = await db.students.find_one({"id": sid})
    if not existing:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    payload = body.model_dump(by_alias=True)
    payload["updatedAt"] = now_iso()
    await db.students.update_one({"id": sid}, {"$set": payload})
    doc = await db.students.find_one({"id": sid}, {"_id": 0})
    return doc

@api.delete("/students/{sid}")
async def delete_student(sid: str, current=Depends(get_current_user)):
    result = await db.students.delete_one({"id": sid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الطالب غير موجود")
    return {"ok": True}

# ----------------- Dashboard -----------------

@api.get("/dashboard/stats")
async def dashboard_stats(current=Depends(get_current_user)):
    total = await db.students.count_documents({})
    female = await db.students.count_documents({"student.gender": "female"})
    male = await db.students.count_documents({"student.gender": "male"})
    orphans = await db.students.count_documents({"student.orphan": True})
    return {"total": total, "female": female, "male": male, "orphans": orphans}

# ----------------- Startup / seed -----------------

@app.on_event("startup")
async def on_startup():
    # Seed admin only if no users exist
    existing_count = await db.users.count_documents({})
    if existing_count == 0:
        seed_username = os.environ.get("SEED_ADMIN_USERNAME", "admin")
        seed_password = os.environ.get("SEED_ADMIN_PASSWORD", "admin123")
        seed_name = os.environ.get("SEED_ADMIN_NAME", "مدير النظام")
        doc = {
            "id": str(uuid.uuid4()),
            "name": seed_name,
            "username": seed_username,
            "password": hash_password(seed_password),
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        await db.users.insert_one(doc)
        logging.info(f"Seeded initial admin user: {seed_username}")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
