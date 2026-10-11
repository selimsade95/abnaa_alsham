import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  Users,
  User,
  UserCheck,
  HeartHandshake,
  Wallet,
  TrendingUp,
  AlertCircle,
  BookOpen,
  Bus,
  Shirt,
  CalendarCheck,
  UserX,
  Clock3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const StatCard = ({ title, value, icon: Icon, tint, testid }) => (
  <div
    data-testid={testid}
    className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow"
  >
    <div className="flex items-start justify-between">
      <div>
        <div className="text-sm text-gray-500 mb-2">{title}</div>
        <div className="text-3xl font-extrabold text-gray-900 tabular-nums">
          {value}
        </div>
      </div>
      <div
        className="h-11 w-11 rounded-lg flex items-center justify-center"
        style={{ background: tint.bg, color: tint.fg }}
      >
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const { has, hasAny } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then((r) => setStats(r.data))
      .catch(() => setErr("تعذر تحميل الإحصائيات"))
      .finally(() => setLoading(false));
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Students Stats */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-900">
              إحصائيات الطلاب
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              نظرة عامة على الطلاب المسجلين
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <StatCard
              title="الأيتام"
              value={loading ? "…" : (stats?.orphans ?? 0)}
              icon={HeartHandshake}
              tint={{ bg: "#FEF3E7", fg: "#B45309" }}
              testid="stat-orphans"
            />
          </div>
        </section>

        {/* Attendance Stats */}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      {/* Repeated Absence Reports */}
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

      {/* Financial Stats */}
      {has("payments.view") && (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-900">
              الملخص المالي
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              ملخص الرسوم والمبالغ المالية للطلاب
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              title="إجمالي المستحق"
              value={
                loading
                  ? "…"
                  : (stats?.totalPayable ?? 0).toLocaleString("ar-EG")
              }
              icon={Wallet}
              tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
              testid="stat-payable"
            />

            <StatCard
              title="إجمالي المحصّل"
              value={
                loading
                  ? "…"
                  : (stats?.totalCollected ?? 0).toLocaleString("ar-EG")
              }
              icon={TrendingUp}
              tint={{ bg: "#E7F7EE", fg: "#166534" }}
              testid="stat-collected"
            />

            <StatCard
              title="إجمالي المتبقي"
              value={
                loading
                  ? "…"
                  : (stats?.totalRemaining ?? 0).toLocaleString("ar-EG")
              }
              icon={AlertCircle}
              tint={{ bg: "#FEF3E7", fg: "#B45309" }}
              testid="stat-remaining"
            />

            <StatCard
              title="إجمالي رسوم الكتب"
              value={
                loading
                  ? "…"
                  : (stats?.totalBooksFee ?? 0).toLocaleString("ar-EG")
              }
              icon={BookOpen}
              tint={{ bg: "#F4F7E8", fg: "#58721C" }}
              testid="stat-books-fee"
            />

            <StatCard
              title="إجمالي رسوم الحافلة"
              value={
                loading
                  ? "…"
                  : (stats?.totalBusFee ?? 0).toLocaleString("ar-EG")
              }
              icon={Bus}
              tint={{ bg: "#FFF1E8", fg: "#A94E17" }}
              testid="stat-bus-fee"
            />

            <StatCard
              title="إجمالي رسوم الزي"
              value={
                loading
                  ? "…"
                  : (stats?.totalOutfitFee ?? 0).toLocaleString("ar-EG")
              }
              icon={Shirt}
              tint={{ bg: "#E8F6EF", fg: "#176B45" }}
              testid="stat-outfit-fee"
            />
          </div>
        </section>
      )}
    </div>
  );
}
