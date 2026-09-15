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
