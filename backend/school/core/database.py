import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from school.core.branching import BranchScopedDatabase
from school.core.services import configure as configure_services


# The backend moved. Existing uploads and .env did not.
ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / '.env')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_HOURS = int(os.environ.get('JWT_EXPIRE_HOURS', '24'))
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', str(ROOT_DIR / 'uploads')))
ORPHAN_DIR = UPLOAD_DIR / 'orphan-documents'
STUDENT_DOCUMENTS_DIR = UPLOAD_DIR / 'student-documents'
TEACHER_DOCUMENTS_DIR = UPLOAD_DIR / 'teacher-documents'
ORPHAN_DIR.mkdir(parents=True, exist_ok=True)
STUDENT_DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
TEACHER_DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_MB', '10')) * 1024 * 1024

client = AsyncIOMotorClient(MONGO_URL)
raw_db = client[DB_NAME]
db = BranchScopedDatabase(raw_db)
configure_services(db, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS)
