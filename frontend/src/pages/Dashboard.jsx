import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  Users,
  User,
  UserCheck,
  Wallet,
  TrendingUp,
  AlertCircle,
  BookOpen,
  Bus,
  CalendarCheck,
  UserX,
  Clock3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const StatCard = ({ title, value, icon: Icon, tint, testid }) => (
  <div
    data-testid={testid}
    className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow"
  >
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs font-medium text-gray-500 mb-2">{title}</div>
        <div className="text-2xl font-extrabold text-gray-900 tabular-nums">
          {value}
        </div>
      </div>
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center"
        style={{ background: tint.bg, color: tint.fg }}
      >
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

const FinanceRow = ({
  title,
  totals,
  loading,
  testid,
  payableIcon = Wallet,
}) => (
  <div>
    <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        title="إجمالي المستحق"
        value={loading ? "…" : (totals?.payable ?? 0).toLocaleString("ar-EG")}
        icon={payableIcon}
        tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
        testid={`${testid}-payable`}
      />
      <StatCard
        title="إجمالي المدفوع"
        value={loading ? "…" : (totals?.paid ?? 0).toLocaleString("ar-EG")}
        icon={TrendingUp}
        tint={{ bg: "#E7F7EE", fg: "#166534" }}
        testid={`${testid}-paid`}
      />
      <StatCard
        title="إجمالي المتبقي"
        value={loading ? "…" : (totals?.remaining ?? 0).toLocaleString("ar-EG")}
        icon={AlertCircle}
        tint={{ bg: "#FEF3E7", fg: "#B45309" }}
        testid={`${testid}-remaining`}
      />
    </div>
  </div>
);

export default function Dashboard() {
  const { has, hasAny } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErr("");
    api
      .get("/dashboard/stats", {
        signal: controller.signal,
      })
      .then((r) => setStats(r.data))
      .catch((error) => {
        if (error?.code !== "ERR_CANCELED") setErr("تعذر تحميل الإحصائيات");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">لوحة التحكم</h1>
          <p className="text-sm text-gray-500 mt-1">
            نظرة عامة على تسجيلات الطلاب
          </p>
        </div>
        {has("students.create") && (
          <Link
            to="/students/new"
            data-testid="dashboard-add-student-btn"
            className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1] transition-colors"
          >
            + إضافة طالب
          </Link>
        )}
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="mb-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                إحصائيات الطلاب
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                أعداد الطلاب حسب الجنس والمسار وحالة التسجيل
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              title="إجمالي الطلاب"
              value={loading ? "…" : (stats?.total ?? 0)}
              icon={Users}
              tint={{ bg: "#E0F9FF", fg: "#036A87" }}
              testid="stat-total"
            />

            <StatCard
              title="الطالبات"
              value={loading ? "…" : (stats?.female ?? 0)}
              icon={User}
              tint={{ bg: "#FDE9F1", fg: "#B4356D" }}
              testid="stat-female"
            />
            <StatCard
              title="الطلاب الذكور"
              value={loading ? "…" : (stats?.male ?? 0)}
              icon={UserCheck}
              tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
              testid="stat-male"
            />
          </div>

          <h3 className="mb-3 mt-5 text-sm font-semibold text-gray-700">
            الطلاب حسب المسار
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(stats?.studentPaths || []).map((pathStats, index) => (
              <StatCard
                key={pathStats.path}
                title={`طلاب المسار: ${pathStats.path}`}
                value={loading ? "…" : pathStats.total}
                icon={Users}
                tint={{ bg: "#E0F9FF", fg: "#036A87" }}
                testid={`stat-path-students-${index}`}
              />
            ))}
          </div>

          <h3 className="mb-3 mt-5 text-sm font-semibold text-gray-700">
            الطلاب المنسحبون حسب المسار
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(stats?.studentPaths || []).map((pathStats, index) => (
              <StatCard
                key={pathStats.path}
                title={`المنسحبون من المسار: ${pathStats.path}`}
                value={loading ? "…" : pathStats.dropped}
                icon={UserX}
                tint={{ bg: "#FEF3E7", fg: "#B45309" }}
                testid={`stat-path-dropped-${index}`}
              />
            ))}
          </div>
        </section>

        {has("teachers.view") && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                إحصائيات المعلمين
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                title="إجمالي المعلمين"
                value={loading ? "…" : (stats?.teacherStats?.total ?? 0)}
                icon={Users}
                tint={{ bg: "#E0F9FF", fg: "#036A87" }}
                testid="stat-teachers-total"
              />
              <StatCard
                title="المعلمات"
                value={loading ? "…" : (stats?.teacherStats?.female ?? 0)}
                icon={User}
                tint={{ bg: "#FDE9F1", fg: "#B4356D" }}
                testid="stat-teachers-female"
              />
              <StatCard
                title="المعلمون الذكور"
                value={loading ? "…" : (stats?.teacherStats?.male ?? 0)}
                icon={UserCheck}
                tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
                testid="stat-teachers-male"
              />
            </div>
          </section>
        )}

        {has("payments.view") && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                الإحصائيات المالية
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                المستحق والمدفوع والمتبقي للرسوم الدراسية والحافلات
              </p>
            </div>

            {has("reports.view") && (
              <div className="mb-4">
                <Link
                  to="/reports"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#036A87] px-3 py-2 text-sm font-medium text-white hover:bg-[#02556d]"
                >
                  فتح تقارير المدفوعات
                </Link>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <h3 className="mb-4 text-base font-semibold text-gray-800">
                  جميع المسارات
                </h3>
                <div className="space-y-5">
                  <FinanceRow
                    title="الرسوم الدراسية"
                    totals={stats?.finance?.all?.academic}
                    loading={loading}
                    testid="stat-finance-all-academic"
                    payableIcon={BookOpen}
                  />
                  <FinanceRow
                    title="رسوم الحافلة"
                    totals={stats?.finance?.all?.transportation}
                    loading={loading}
                    testid="stat-finance-all-bus"
                    payableIcon={Bus}
                  />
                </div>
              </div>

              {(stats?.finance?.byPath || []).map((pathStats, index) => (
                <div key={pathStats.path}>
                  <h3 className="mb-4 text-base font-semibold text-gray-800">
                    مسار {pathStats.path}
                  </h3>
                  <div className="space-y-5">
                    <FinanceRow
                      title="الرسوم الدراسية"
                      totals={pathStats.academic}
                      loading={loading}
                      testid={`stat-finance-path-${index}-academic`}
                      payableIcon={BookOpen}
                    />
                    <FinanceRow
                      title="رسوم الحافلة"
                      totals={pathStats.transportation}
                      loading={loading}
                      testid={`stat-finance-path-${index}-bus`}
                      payableIcon={Bus}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {hasAny(["attendance.view", "attendance.manage"]) && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  إحصائيات الحضور اليوم
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {stats?.attendance?.date || ""}
                </p>
              </div>
              <Link
                to="/attendance"
                className="text-sm font-medium text-[#036A87] hover:underline whitespace-nowrap"
              >
                فتح الحضور
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                title="نسبة الحضور"
                value={
                  loading ? "…" : `${stats?.attendance?.attendanceRate ?? 0}%`
                }
                icon={CalendarCheck}
                tint={{ bg: "#E7F7EE", fg: "#166534" }}
                testid="stat-attendance-rate"
              />
              <StatCard
                title="الطلاب الحاضرون"
                value={loading ? "…" : (stats?.attendance?.present ?? 0)}
                icon={Users}
                tint={{ bg: "#E0F9FF", fg: "#036A87" }}
                testid="stat-attendance-present"
              />
              <StatCard
                title="الطلاب الغائبون"
                value={loading ? "…" : (stats?.attendance?.absent ?? 0)}
                icon={UserX}
                tint={{ bg: "#FEF3E7", fg: "#B45309" }}
                testid="stat-attendance-absent"
              />
              <StatCard
                title="الطلاب المتأخرون"
                value={loading ? "…" : (stats?.attendance?.late ?? 0)}
                icon={Clock3}
                tint={{ bg: "#FFF1E8", fg: "#A94E17" }}
                testid="stat-attendance-late"
              />
              <StatCard
                title="الصفوف المسجل حضورها"
                value={
                  loading
                    ? "…"
                    : `${stats?.attendance?.markedClasses ?? 0} / ${
                        stats?.attendance?.totalClasses ?? 0
                      }`
                }
                icon={BookOpen}
                tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
                testid="stat-attendance-classes"
              />
            </div>
          </section>
        )}

        {has("attendance.reports.view") && (
          <Link
            to="/attendance?tab=reports"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 hover:bg-amber-100"
            data-testid="stat-repeated-absence-reports"
          >
            <span className="font-medium">تقارير الغياب المتكرر</span>
            <span className="rounded-full bg-white px-3 py-1 font-bold tabular-nums">
              {loading ? "…" : (stats?.repeatedAbsenceReports ?? 0)}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
