import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import StudentsList from "@/pages/StudentsList";
import StudentForm from "@/pages/StudentForm";
import StudentView from "@/pages/StudentView";
import StudentPrint from "@/pages/StudentPrint";
import StudentCard from "@/pages/StudentCard";
import StudentValidation from "@/pages/StudentValidation";
import StudentFullInfo from "@/pages/StudentFullInfo";
import Users from "@/pages/Users";
import Roles from "@/pages/Roles";
import Payments from "@/pages/Payments";
import PaymentPrint from "@/pages/PaymentPrint";
import Teachers from "@/pages/Teachers";
import TeacherForm from "@/pages/TeacherForm";
import Classes from "@/pages/Classes";
import Settings from "@/pages/Settings";
import Subjects from "@/pages/Subjects";
import Grades from "@/pages/Grades";
import StudentFullInfoEdit from "@/pages/StudentFullInfoEdit";
import AppLayout from "@/components/AppLayout";

function Protected({ children, perm }) {
  const { user, loading, has } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        جاري التحميل...
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (perm && !has(perm))
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        لا تملك صلاحية الوصول إلى هذه الصفحة
      </div>
    );
  return children;
}

function App() {
  useEffect(() => {
    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "ar");
  }, []);
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-center" richColors closeButton />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/validate/student/:id" element={<StudentValidation />} />
          <Route
            path="/students/:id/print"
            element={
              <Protected perm="students.print">
                <StudentPrint />
              </Protected>
            }
          />
          <Route
            path="/students/:id/card"
            element={
              <Protected perm="students.print">
                <StudentCard />
              </Protected>
            }
          />
          <Route
            path="/students/:id/payments/print"
            element={
              <Protected perm="payments.print">
                <PaymentPrint studentHistory />
              </Protected>
            }
          />
          <Route
            path="/payments/print"
            element={
              <Protected perm="payments.print">
                <PaymentPrint />
              </Protected>
            }
          />
          <Route
            path="/payments/:id/print"
            element={
              <Protected perm="payments.print">
                <PaymentPrint />
              </Protected>
            }
          />
          <Route
            element={
              <Protected>
                <AppLayout />
              </Protected>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/students"
              element={
                <Protected perm="students.view">
                  <StudentsList />
                </Protected>
              }
            />
            <Route
              path="/students/new"
              element={
                <Protected perm="students.create">
                  <StudentForm mode="create" />
                </Protected>
              }
            />
            <Route
              path="/students/:id"
              element={
                <Protected perm="students.view">
                  <StudentView />
                </Protected>
              }
            />
            <Route
              path="/students/:id/edit"
              element={
                <Protected perm="students.update">
                  <StudentForm mode="edit" />
                </Protected>
              }
            />
            <Route
              path="/students/:id/full-information"
              element={
                <Protected perm="students.fullInformation.view">
                  <StudentFullInfo />
                </Protected>
              }
            />
            <Route
              path="/students/:id/full-information/edit"
              element={
                <Protected perm="students.update">
                  <StudentFullInfoEdit />
                </Protected>
              }
            />
            <Route
              path="/teachers"
              element={
                <Protected perm="teachers.view">
                  <Teachers />
                </Protected>
              }
            />
            <Route
              path="/teachers/new"
              element={
                <Protected perm="teachers.create">
                  <TeacherForm mode="create" />
                </Protected>
              }
            />
            <Route
              path="/teachers/:id/edit"
              element={
                <Protected perm="teachers.update">
                  <TeacherForm mode="edit" />
                </Protected>
              }
            />
            <Route
              path="/classes"
              element={
                <Protected perm="classes.view">
                  <Classes />
                </Protected>
              }
            />
            <Route
              path="/subjects"
              element={
                <Protected perm="subjects.view">
                  <Subjects />
                </Protected>
              }
            />
            <Route
              path="/grades"
              element={
                <Protected perm="grades.view">
                  <Grades />
                </Protected>
              }
            />
            <Route
              path="/payments"
              element={
                <Protected perm="payments.view">
                  <Payments />
                </Protected>
              }
            />
            <Route
              path="/users"
              element={
                <Protected perm="users.view">
                  <Users />
                </Protected>
              }
            />
            <Route
              path="/roles"
              element={
                <Protected perm="roles.view">
                  <Roles />
                </Protected>
              }
            />
            <Route
              path="/settings"
              element={
                <Protected perm="settings.codeGeneration.view">
                  <Settings />
                </Protected>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
