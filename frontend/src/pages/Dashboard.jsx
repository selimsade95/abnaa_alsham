import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Users, User, UserCheck, HeartHandshake } from "lucide-react";
import { Link } from "react-router-dom";

const StatCard = ({ title, value, icon: Icon, tint, testid }) => (
  <div
    data-testid={testid}
    className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow"
  >
    <div className="flex items-start justify-between">
      <div>
        <div className="text-sm text-gray-500 mb-2">{title}</div>
        <div className="text-3xl font-extrabold text-gray-900 tabular-nums">{value}</div>
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
          <p className="text-sm text-gray-500 mt-1">نظرة عامة على تسجيلات الطلاب</p>
        </div>
        <Link
          to="/students/new"
          data-testid="dashboard-add-student-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1] transition-colors"
        >
          + إضافة طالب
        </Link>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          title="إجمالي الطلاب"
          value={loading ? "…" : stats?.total ?? 0}
          icon={Users}
          tint={{ bg: "#E0F9FF", fg: "#036A87" }}
          testid="stat-total"
        />
        <StatCard
          title="الطالبات"
          value={loading ? "…" : stats?.female ?? 0}
          icon={User}
          tint={{ bg: "#FDE9F1", fg: "#B4356D" }}
          testid="stat-female"
        />
        <StatCard
          title="الطلاب الذكور"
          value={loading ? "…" : stats?.male ?? 0}
          icon={UserCheck}
          tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
          testid="stat-male"
        />
        <StatCard
          title="الأيتام"
          value={loading ? "…" : stats?.orphans ?? 0}
          icon={HeartHandshake}
          tint={{ bg: "#FEF3E7", fg: "#B45309" }}
          testid="stat-orphans"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">إجراءات سريعة</h2>
        <p className="text-sm text-gray-500 mb-4">
          استخدم القائمة الجانبية للوصول إلى إدارة الطلاب والمستخدمين.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/students"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            عرض قائمة الطلاب
          </Link>
          <Link
            to="/students/new"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            تسجيل طالب جديد
          </Link>
          <Link
            to="/users"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            إدارة المستخدمين
          </Link>
        </div>
      </div>
    </div>
  );
}
