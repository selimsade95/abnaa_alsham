import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/auth/Login";
import Dashboard from "@/pages/dashboard/Dashboard";
import StudentsList from "@/pages/students/StudentsList";
import StudentForm from "@/pages/students/StudentForm";
import StudentView from "@/pages/students/StudentView";
import StudentPrint from "@/pages/students/StudentPrint";
import StudentCard from "@/pages/students/StudentCard";
import StudentValidation from "@/pages/students/StudentValidation";
import ParentAccess from "@/pages/parent-access/ParentAccess";
import StudentFullInfo from "@/pages/students/StudentFullInfo";
import Users from "@/pages/users/Users";
import UserForm from "@/pages/users/UserForm";
import UserView from "@/pages/users/UserView";
import Roles from "@/pages/roles/Roles";
import Payments from "@/pages/payments/Payments";
import PaymentPrint from "@/pages/payments/PaymentPrint";
import Reports from "@/pages/reports/Reports";
import Teachers from "@/pages/teachers/Teachers";
import TeacherForm from "@/pages/teachers/TeacherForm";
import TeacherView from "@/pages/teachers/TeacherView";
import Classes from "@/pages/classes/Classes";
import ClassView from "@/pages/classes/ClassView";
import Settings from "@/pages/settings/Settings";
import Branches from "@/pages/branches/Branches";
import Subjects from "@/pages/subjects/Subjects";
import Grades from "@/pages/grades/Grades";
import GradeAnnouncements from "@/pages/announcements/GradeAnnouncements";
import StudentRecitations from "@/pages/recitations/StudentRecitations";
import RecitationSettings from "@/pages/recitations/RecitationSettings";
import Homework from "@/pages/homework/Homework";
import Attendance from "@/pages/attendance/Attendance";
import DailyReports from "@/pages/daily-reports/DailyReports";
import VerificationMessages from "@/pages/messages/VerificationMessages";
import StudentFullInfoEdit from "@/pages/students/StudentFullInfoEdit";
import AuditLogs from "@/pages/audit/AuditLogs";
import AppLayout from "@/components/AppLayout";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { initializeLanguage } from "@/i18n";

initializeLanguage();

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
  if (
    perm &&
    !(Array.isArray(perm)
      ? perm.some((permission) => has(permission))
      : has(perm))
  )
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        لا تملك صلاحية الوصول إلى هذه الصفحة
      </div>
    );
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-center" richColors closeButton />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/parent-access" element={<ParentAccess />} />
          <Route
            path="/validate/student/:id"
            element={
              <>
                <div className="fixed end-4 top-4 z-50 flex gap-2">
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                </div>
                <StudentValidation />
              </>
            }
          />
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
              path="/students/:id/recitations"
              element={<Protected perm={["recitations.view", "recitations.create"]}><StudentRecitations /></Protected>}
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
              path="/teachers/:id"
              element={
                <Protected perm="teachers.view">
                  <TeacherView />
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
              path="/classes/:id"
              element={
                <Protected perm="classes.view">
                  <ClassView />
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
              path="/attendance"
              element={
                <Protected
                  perm={[
                    "attendance.view",
                    "attendance.manage",
                    "attendance.reports.view",
                  ]}
                >
                  <Attendance />
                </Protected>
              }
            />
            <Route
              path="/daily-reports"
              element={
                <Protected
                  perm={[
                    "dailyReports.view",
                    "dailyReports.create",
                    "dailyReports.update",
                    "dailyReports.print",
                  ]}
                >
                  <DailyReports />
                </Protected>
              }
            />
            <Route
              path="/homework"
              element={
                <Protected perm="homework.view">
                  <Homework />
                </Protected>
              }
            />
            <Route
              path="/messages"
              element={
                <Protected perm="messages.view">
                  <VerificationMessages />
                </Protected>
              }
            />
            <Route
              path="/grade-announcements"
              element={<Protected perm="announcements.manage"><GradeAnnouncements /></Protected>}
            />
            <Route
              path="/verification-messages"
              element={<Navigate to="/messages" replace />}
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
              path="/reports"
              element={
                <Protected perm="reports.view">
                  <Reports />
                </Protected>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <Protected perm="auditLogs.view">
                  <AuditLogs />
                </Protected>
              }
            />
            <Route
              path="/users/new"
              element={
                <Protected perm="users.create">
                  <UserForm />
                </Protected>
              }
            />
            <Route
              path="/users/:id/edit"
              element={
                <Protected perm="users.update">
                  <UserForm />
                </Protected>
              }
            />
            <Route
              path="/users/:id"
              element={
                <Protected perm="users.view">
                  <UserView />
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
              path="/recitation-settings"
              element={<Protected perm="recitations.configure"><RecitationSettings /></Protected>}
            />
            <Route
              path="/settings"
              element={
                <Protected perm="settings.codeGeneration.view">
                  <Settings />
                </Protected>
              }
            />
            <Route
              path="/branches"
              element={
                <Protected perm="branches.manage">
                  <Branches />
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
