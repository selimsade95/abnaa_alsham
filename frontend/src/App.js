import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import StudentsList from "@/pages/StudentsList";
import StudentForm from "@/pages/StudentForm";
import StudentView from "@/pages/StudentView";
import StudentPrint from "@/pages/StudentPrint";
import Users from "@/pages/Users";
import Roles from "@/pages/Roles";
import Payments from "@/pages/Payments";
import AppLayout from "@/components/AppLayout";

function Protected({ children, perm }) {
  const { user, loading, has } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">جاري التحميل...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (perm && !has(perm)) return <div className="min-h-screen flex items-center justify-center text-gray-500">لا تملك صلاحية الوصول إلى هذه الصفحة</div>;
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
          <Route path="/students/:id/print" element={<Protected perm="students.print"><StudentPrint /></Protected>} />
          <Route element={<Protected><AppLayout /></Protected>}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/students" element={<Protected perm="students.view"><StudentsList /></Protected>} />
            <Route path="/students/new" element={<Protected perm="students.create"><StudentForm mode="create" /></Protected>} />
            <Route path="/students/:id" element={<Protected perm="students.view"><StudentView /></Protected>} />
            <Route path="/students/:id/edit" element={<Protected perm="students.update"><StudentForm mode="edit" /></Protected>} />
            <Route path="/payments" element={<Protected perm="payments.view"><Payments /></Protected>} />
            <Route path="/users" element={<Protected perm="users.view"><Users /></Protected>} />
            <Route path="/roles" element={<Protected perm="roles.view"><Roles /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
