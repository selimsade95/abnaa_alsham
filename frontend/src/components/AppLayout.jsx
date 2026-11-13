import { useEffect, useState } from "react";
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
  ClipboardCheck,
  ClipboardList,
  CalendarCheck,
  Clipboard,
  MessageSquareText,
  BarChart3,
  Building2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import SidebarSearch from "@/components/SidebarSearch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getLanguage } from "@/i18n";
import { useTranslation } from "react-i18next";
import { API_MUTATION_EVENT } from "@/lib/api";

export default function AppLayout() {
  const { user, logout, selectBranch, has, hasAny } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState([]);
  const [pendingMutations, setPendingMutations] = useState(0);
  const isRtl = getLanguage() === "ar";

  useEffect(() => {
    const trackMutation = (event) => {
      setPendingMutations((pending) => Math.max(0, pending + event.detail));
    };
    window.addEventListener(API_MUTATION_EVENT, trackMutation);
    return () => window.removeEventListener(API_MUTATION_EVENT, trackMutation);
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (
        !event.ctrlKey ||
        event.key !== "Enter" ||
        event.isComposing ||
        !(event.target instanceof Element)
      )
        return;
      const form = event.target.closest("form");
      if (!form) return;
      event.preventDefault();
      form.requestSubmit();
    };
    document.addEventListener("keydown", handleShortcut, true);
    return () => document.removeEventListener("keydown", handleShortcut, true);
  }, []);

  const dashboardLink = {
    to: "/dashboard",
    label: "الرئيسية",
    icon: LayoutDashboard,
    testid: "nav-dashboard",
  };

  const navigationGroups = [
    {
      id: "studentAffairs",
      items: [
        {
          to: "/students",
          label: "الطلاب",
          icon: GraduationCap,
          testid: "nav-students",
          show: has("students.view"),
        },
        {
          to: "/messages",
          label: "الرسائل",
          icon: MessageSquareText,
          testid: "nav-messages",
          show: has("messages.view"),
        },
      ],
    },
    {
      id: "academics",
      items: [
        {
          to: "/classes",
          label: "الصفوف",
          icon: BookOpen,
          testid: "nav-classes",
          show: has("classes.view"),
        },
        {
          to: "/teachers",
          label: "المعلمون",
          icon: Presentation,
          testid: "nav-teachers",
          show: has("teachers.view"),
        },
        {
          to: "/subjects",
          label: "المواد والإسنادات",
          icon: BookOpen,
          testid: "nav-subjects",
          show: has("subjects.view"),
        },
        {
          to: "/grades",
          label: "الدرجات",
          icon: ClipboardCheck,
          testid: "nav-grades",
          show: has("grades.view"),
        },
        {
          to: "/homework",
          label: "الواجبات",
          icon: ClipboardList,
          testid: "nav-homework",
          show: has("homework.view"),
        },
        {
          to: "/attendance",
          label: "الحضور",
          icon: CalendarCheck,
          testid: "nav-attendance",
          show: hasAny([
            "attendance.view",
            "attendance.manage",
            "attendance.reports.view",
          ]),
        },
        {
          to: "/daily-reports",
          label: t("navigation.dailyReports"),
          icon: Clipboard,
          testid: "nav-daily-reports",
          show: hasAny([
            "dailyReports.view",
            "dailyReports.create",
            "dailyReports.update",
            "dailyReports.print",
          ]),
        },
        {
          to: "/grade-announcements",
          label: t("announcements.title"),
          icon: MessageSquareText,
          testid: "nav-grade-announcements",
          show: has("announcements.manage"),
        },
      ],
    },
    {
      id: "finance",
      items: [
        {
          to: "/payments",
          label: "المدفوعات",
          icon: Wallet,
          testid: "nav-payments",
          show: has("payments.view"),
        },
        {
          to: "/reports",
          label: "التقارير",
          icon: BarChart3,
          testid: "nav-reports",
          show: has("reports.view"),
        },
      ],
    },
    {
      id: "administration",
      items: [
        {
          to: "/branches",
          label: "فروع المدرسة",
          icon: Building2,
          testid: "nav-branches",
          show: has("branches.manage"),
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
        {
          to: "/audit-logs",
          label: t("navigation.auditLogs"),
          icon: ClipboardList,
          testid: "nav-audit-logs",
          show: has("auditLogs.view"),
        },
      ],
    },
  ];

  const switchBranch = async (branchId) => {
    try {
      await selectBranch(branchId);
      window.location.reload();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر تغيير الفرع");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const renderNavigationLink = (item, onClickItem) => {
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
              ? "bg-brand-light text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`
        }
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  const renderSidebarBody = (onClickItem) => (
    <div className="flex min-h-0 h-full flex-col">
      <div className="flex items-center gap-3 px-6 py-6 border-b border-border">
        <img
          src="/assets/school_logo.png"
          alt="Abnaa Alsham"
          className="h-10 w-10 rounded-lg object-contain"
        />
        <div>
          <div className="text-lg font-bold text-foreground leading-tight">
            مدرسة أبناء الشام
          </div>
          {user?.branches?.length > 1 ? (
            <select
              value={user.activeBranch?.id || ""}
              onChange={(event) => switchBranch(event.target.value)}
              aria-label="الفرع الحالي"
              data-testid="active-branch-select"
              className="mt-1 max-w-40 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
            >
              {user.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-muted-foreground">نظام إدارة المدرسة</div>
          )}
        </div>
      </div>
      {hasAny(["students.view", "teachers.view", "classes.view"]) && <SidebarSearch onNavigate={onClickItem} />}
      <nav aria-label={t("navigation.sections")} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {renderNavigationLink(dashboardLink, onClickItem)}
        <Accordion type="multiple" value={expandedSections} onValueChange={setExpandedSections}>
          {navigationGroups.map(({ id, items }) => {
            const visibleItems = items.filter((item) => item.show);
            if (!visibleItems.length) return null;
            return (
              <AccordionItem key={id} value={id} className="border-b-0 border-t border-border">
                <AccordionTrigger className="rounded-lg px-4 py-3 text-start text-xs font-bold text-muted-foreground hover:bg-muted hover:no-underline">
                  {t(`navigation.${id}`)}
                </AccordionTrigger>
                <AccordionContent className="space-y-1 pb-2">
                  {visibleItems.map((item) => renderNavigationLink(item, onClickItem))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </nav>
      <p className="text-sm text-center text-muted-foreground">
        تم إنشاؤه بواسطة مؤسسة{" "}
        <a
          className="text-muted-foreground"
          href="https://iqracharity.org"
          target="_blank"
        >
          اقرأ الخيرية
        </a>
      </p>
      <div className="border-t border-border p-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="h-9 w-9 rounded-full bg-brand-light text-accent-foreground flex items-center justify-center text-sm font-bold">
            {user?.name?.charAt(0) || "؟"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {user?.name}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              @{user?.username}
            </div>
          </div>
        </div>
        <div className="mb-3 flex justify-center gap-1">
        <button
          onClick={handleLogout}
          data-testid="logout-btn"
          className="rounded-lg border border-border px-3 py-2 text-foreground hover:bg-red-900"
        >
          <LogOut className="h-4 w-4" />
        </button>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );

  return (
    <div className="theme-canvas min-h-screen">
      {pendingMutations > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("general.processingChanges")}
        </div>
      )}
      <aside
        className={`theme-glass hidden lg:block fixed inset-y-0 ${isRtl ? "right-0 border-l" : "left-0 border-r"} w-64 border-border`}
      >
        {renderSidebarBody()}
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 theme-scrim"
            onClick={() => setOpen(false)}
          />
          <div
            className={`theme-glass absolute inset-y-0 flex flex-col ${isRtl ? "right-0" : "left-0"} w-72 shadow-xl`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">القائمة</span>
              <button
                onClick={() => setOpen(false)}
                className="p-2 text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderSidebarBody(() => setOpen(false))}
          </div>
        </div>
      )}
      <header className="theme-glass no-print lg:hidden sticky top-0 z-30 border-b border-border flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <img
            src="/assets/logo.png"
            alt="IQRA"
            className="h-8 w-8 object-contain"
          />
          <span className="font-bold text-foreground">مدرسة أبناء الشام</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          data-testid="mobile-menu-btn"
          className="p-2 rounded-lg text-foreground hover:bg-secondary"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      <main className={`${isRtl ? "lg:pr-64" : "lg:pl-64"} min-h-screen`}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
