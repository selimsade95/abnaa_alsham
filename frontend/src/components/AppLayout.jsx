import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Users as UsersIcon,
  GraduationCap,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Wallet,
  BookOpen,
  Presentation,
  Settings as SettingsIcon,
} from "lucide-react";

export default function AppLayout() {
  const { user, logout, has } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const NAV = [
    {
      to: "/dashboard",
      label: "الرئيسية",
      icon: LayoutDashboard,
      testid: "nav-dashboard",
      show: true,
    },
    {
      to: "/students",
      label: "الطلاب",
      icon: GraduationCap,
      testid: "nav-students",
      show: has("students.view"),
    },
    {
      to: "/teachers",
      label: "المعلمون",
      icon: Presentation,
      testid: "nav-teachers",
      show: has("teachers.view"),
    },
    {
      to: "/classes",
      label: "الصفوف",
      icon: BookOpen,
      testid: "nav-classes",
      show: has("classes.view"),
    },
    {
      to: "/payments",
      label: "المدفوعات",
      icon: Wallet,
      testid: "nav-payments",
      show: has("payments.view"),
    },
    {
      to: "/users",
      label: "المستخدمون",
      icon: UsersIcon,
      testid: "nav-users",
      show: has("users.view"),
    },
    {
      to: "/roles",
      label: "الأدوار",
      icon: ShieldCheck,
      testid: "nav-roles",
      show: has("roles.view"),
    },
    {
      to: "/settings",
      label: "الإعدادات",
      icon: SettingsIcon,
      testid: "nav-settings",
      show: has("settings.codeGeneration.view"),
    },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const SidebarBody = ({ onClickItem }) => (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-3 px-6 py-6 border-b border-gray-200">
        <img
          src="/assets/logo.png"
          alt="IQRA"
          className="h-10 w-10 object-contain"
        />
        <div>
          <div className="text-lg font-bold text-gray-900 leading-tight">
            مدرسة اقرأ
          </div>
          <div className="text-xs text-gray-500">نظام تسجيل الطلاب</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.filter((i) => i.show).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClickItem}
              data-testid={item.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-light text-[#036A87]"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 p-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="h-9 w-9 rounded-full bg-brand-light text-[#036A87] flex items-center justify-center text-sm font-bold">
            {user?.name?.charAt(0) || "؟"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {user?.name}
            </div>
            <div className="text-xs text-gray-500 truncate">
              @{user?.username}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          data-testid="logout-btn"
          className="w-full flex items-center gap-2 justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" /> تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="hidden lg:flex fixed inset-y-0 right-0 w-64 border-l border-gray-200">
        <SidebarBody />
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-medium text-gray-700">القائمة</span>
              <button
                onClick={() => setOpen(false)}
                className="p-2 text-gray-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarBody onClickItem={() => setOpen(false)} />
          </div>
        </div>
      )}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <img
            src="/assets/logo.png"
            alt="IQRA"
            className="h-8 w-8 object-contain"
          />
          <span className="font-bold text-gray-900">مدرسة اقرأ</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          data-testid="mobile-menu-btn"
          className="p-2 rounded-lg text-gray-700 hover:bg-gray-100"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      <main className="lg:pr-64 min-h-screen">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
