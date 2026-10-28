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
  BarChart3,
  LayoutGrid,
  Download,
  Printer,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { downloadXlsx, printChartReport } from "@/lib/reportExport";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = ["#036A87", "#B4356D", "#1E40AF", "#B45309"];

const DashboardChart = ({ data, series, height = 190 }) => (
  <div className="w-full" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 34, left: 0, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={112}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10 }}
        />
        <Tooltip />
        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.name}
            fill={item.color || CHART_COLORS[index % CHART_COLORS.length]}
            radius={[0, 5, 5, 0]}
            maxBarSize={20}
          >
            <LabelList dataKey={item.key} position="right" fontSize={10} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const DashboardDonut = ({ data, total, centerLabel, height = 190 }) => (
  <div className="relative w-full" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((item, index) => (
            <Cell
              key={item.label}
              fill={item.color || CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend
          verticalAlign="bottom"
          height={28}
          iconType="circle"
          wrapperStyle={{ fontSize: 11 }}
        />
      </PieChart>
    </ResponsiveContainer>
    {total !== undefined && (
      <div className="pointer-events-none absolute inset-0 mb-7 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-gray-900">
          {total}
        </span>
        <span className="text-[10px] text-gray-500">{centerLabel}</span>
      </div>
    )}
  </div>
);

const FinanceBarChart = ({ totals }) => {
  const data = [
    { label: "المستحق", value: Number(totals?.payable ?? 0), color: "#1E40AF" },
    { label: "المدفوع", value: Number(totals?.paid ?? 0), color: "#16A34A" },
    {
      label: "المتبقي",
      value: Number(totals?.remaining ?? 0),
      color: "#F59E0B",
    },
  ];

  return (
    <div className="w-full" style={{ height: 185 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 38, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar
            dataKey="value"
            name="المبلغ"
            radius={[7, 7, 0, 0]}
            maxBarSize={24}
          >
            {data.map((item) => (
              <Cell key={item.label} fill={item.color} />
            ))}
            <LabelList dataKey="value" position="top" fontSize={10} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const StatCard = ({
  title,
  value,
  icon: Icon,
  tint,
  testid,
  to,
  linkLabel,
}) => (
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
      {to && (
        <Link
          to={to}
          aria-label={linkLabel || `عرض القائمة: ${title}`}
          title={linkLabel || `عرض القائمة: ${title}`}
          data-testid={testid ? `${testid}-link` : undefined}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-[#036A87]"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  </div>
);

const FinanceRow = ({
  title,
  totals,
  loading,
  testid,
  payableIcon = Wallet,
  viewMode,
}) => (
  <div>
    <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
    {viewMode === "charts" ? (
      <FinanceBarChart totals={totals} />
    ) : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title="إجمالي المستحق"
          value={loading ? "…" : (totals?.payable ?? 0)}
          icon={payableIcon}
          tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
          testid={`${testid}-payable`}
        />
        <StatCard
          title="إجمالي المدفوع"
          value={loading ? "…" : (totals?.paid ?? 0)}
          icon={TrendingUp}
          tint={{ bg: "#E7F7EE", fg: "#166534" }}
          testid={`${testid}-paid`}
        />
        <StatCard
          title="إجمالي المتبقي"
          value={loading ? "…" : (totals?.remaining ?? 0)}
          icon={AlertCircle}
          tint={{ bg: "#FEF3E7", fg: "#B45309" }}
          testid={`${testid}-remaining`}
        />
      </div>
    )}
  </div>
);

export default function Dashboard() {
  const { has, hasAny } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filterOptions, setFilterOptions] = useState({
    classes: [],
    academicYears: [],
    registrationPaths: [],
  });
  const [filters, setFilters] = useState({
    classId: "",
    academicYear: "",
    gender: "",
    finalRegistrationPath: "",
  });
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem("dashboard-view-mode") || "numbers",
  );

  const changeViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("dashboard-view-mode", mode);
  };

  const selectedClass = filterOptions.classes.find(
    (classItem) => classItem.id === filters.classId,
  );
  const filterSummary =
    [
      selectedClass ? `الصف: ${selectedClass.name}` : null,
      filters.academicYear ? `العام الدراسي: ${filters.academicYear}` : null,
      filters.gender
        ? `الجنس: ${filters.gender === "male" ? "ذكور" : "إناث"}`
        : null,
      filters.finalRegistrationPath
        ? `المسار: ${filters.finalRegistrationPath}`
        : null,
    ]
      .filter(Boolean)
      .join(" - ") || "جميع البيانات";

  const studentListLink = (cardFilters = {}) => {
    const params = new URLSearchParams({ filterSource: "dashboard" });
    Object.entries({ ...filters, ...cardFilters }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `/students?${params.toString()}`;
  };
  const teacherListLink = (gender) => {
    const params = new URLSearchParams({
      filterSource: "dashboard",
      employmentStatus: "all",
    });
    if (gender) params.set("gender", gender);
    return `/teachers?${params.toString()}`;
  };

  const getExportSections = () => {
    if (!stats) return [];
    const sections = [
      {
        title: "إحصائيات الطلاب",
        headers: ["المؤشر", "القيمة"],
        rows: [
          ["إجمالي الطلاب", stats.total ?? 0],
          ["الطالبات", stats.female ?? 0],
          ["الطلاب الذكور", stats.male ?? 0],
          ["الطلاب النشطون", stats.active ?? 0],
          ["الطلاب المنسحبون", stats.dropped ?? 0],
        ],
      },
      {
        title: "الطلاب حسب المسار",
        headers: ["المسار", "الطلاب النشطون", "المنسحبون"],
        rows: (stats.studentPaths || []).map((item) => [
          item.path,
          item.total ?? 0,
          item.dropped ?? 0,
        ]),
      },
    ];
    if (has("teachers.view")) {
      sections.push({
        title: "إحصائيات المعلمين",
        headers: ["المؤشر", "القيمة"],
        rows: [
          ["إجمالي المعلمين", stats.teacherStats?.total ?? 0],
          ["المعلمات", stats.teacherStats?.female ?? 0],
          ["المعلمون الذكور", stats.teacherStats?.male ?? 0],
        ],
      });
    }
    if (has("payments.view")) {
      const financeRows = [];
      const financeTypes = [
        ["academic", "الرسوم الدراسية"],
        ["transportation", "رسوم الحافلة"],
      ];
      financeTypes.forEach(([key, label]) => {
        const totals = stats.finance?.all?.[key] || {};
        financeRows.push([
          "جميع المسارات",
          label,
          totals.payable ?? 0,
          totals.paid ?? 0,
          totals.remaining ?? 0,
        ]);
        (stats.finance?.byPath || []).forEach((path) => {
          const pathTotals = path[key] || {};
          financeRows.push([
            path.path,
            label,
            pathTotals.payable ?? 0,
            pathTotals.paid ?? 0,
            pathTotals.remaining ?? 0,
          ]);
        });
      });
      sections.push({
        title: "الإحصائيات المالية",
        headers: ["المسار", "نوع الرسوم", "المستحق", "المدفوع", "المتبقي"],
        rows: financeRows,
      });
    }
    if (hasAny(["attendance.view", "attendance.manage"]) && stats.attendance) {
      sections.push({
        title: "إحصائيات الحضور اليوم",
        headers: ["المؤشر", "القيمة"],
        rows: [
          ["التاريخ", stats.attendance.date || ""],
          ["نسبة الحضور", `${stats.attendance.attendanceRate ?? 0}%`],
          ["الحاضرون", stats.attendance.present ?? 0],
          ["الغائبون", stats.attendance.absent ?? 0],
          ["المتأخرون", stats.attendance.late ?? 0],
          [
            "الصفوف المسجل حضورها",
            `${stats.attendance.markedClasses ?? 0} / ${stats.attendance.totalClasses ?? 0}`,
          ],
        ],
      });
    }
    if (has("attendance.reports.view")) {
      sections.push({
        title: "تقارير الغياب المتكرر",
        headers: ["المؤشر", "القيمة"],
        rows: [["عدد التقارير", stats.repeatedAbsenceReports ?? 0]],
      });
    }
    return sections;
  };

  const getChartExportSections = () => {
    if (!stats) return [];

    const charts = [
      {
        title: "توزيع الطلاب حسب الجنس",
        items: [
          { label: "الطالبات", value: stats.female ?? 0, color: "#B4356D" },
          { label: "الطلاب الذكور", value: stats.male ?? 0, color: "#1E40AF" },
        ],
      },
      {
        title: "الطلاب حسب المسار",
        items: (stats.studentPaths || []).map((item) => ({
          label: item.path,
          value: item.total ?? 0,
          color: "#036A87",
        })),
      },
      {
        title: "المنسحبون حسب المسار",
        items: (stats.studentPaths || []).map((item) => ({
          label: item.path,
          value: item.dropped ?? 0,
          color: "#B45309",
        })),
      },
    ];

    if (has("teachers.view")) {
      charts.push({
        title: "توزيع المعلمين حسب الجنس",
        items: [
          {
            label: "المعلمات",
            value: stats.teacherStats?.female ?? 0,
            color: "#B4356D",
          },
          {
            label: "المعلمون الذكور",
            value: stats.teacherStats?.male ?? 0,
            color: "#1E40AF",
          },
        ],
      });
    }

    if (has("payments.view")) {
      const financeTypes = [
        ["academic", "الرسوم الدراسية"],
        ["transportation", "رسوم الحافلة"],
      ];
      financeTypes.forEach(([key, label]) => {
        const totals = stats.finance?.all?.[key] || {};
        charts.push({
          title: `${label} - جميع المسارات`,
          items: [
            { label: "المستحق", value: totals.payable ?? 0, color: "#1E40AF" },
            { label: "المدفوع", value: totals.paid ?? 0, color: "#16A34A" },
            {
              label: "المتبقي",
              value: totals.remaining ?? 0,
              color: "#F59E0B",
            },
          ],
        });
        (stats.finance?.byPath || []).forEach((path) => {
          const pathTotals = path[key] || {};
          charts.push({
            title: `${label} - مسار ${path.path}`,
            items: [
              {
                label: "المستحق",
                value: pathTotals.payable ?? 0,
                color: "#1E40AF",
              },
              {
                label: "المدفوع",
                value: pathTotals.paid ?? 0,
                color: "#16A34A",
              },
              {
                label: "المتبقي",
                value: pathTotals.remaining ?? 0,
                color: "#F59E0B",
              },
            ],
          });
        });
      });
    }

    if (hasAny(["attendance.view", "attendance.manage"]) && stats.attendance) {
      charts.push({
        title: "حالة حضور الطلاب",
        items: [
          {
            label: "حاضرون",
            value: Math.max(
              0,
              Number(stats.attendance.present ?? 0) -
                Number(stats.attendance.late ?? 0),
            ),
            color: "#16A34A",
          },
          {
            label: "متأخرون",
            value: stats.attendance.late ?? 0,
            color: "#F59E0B",
          },
          {
            label: "غائبون",
            value: stats.attendance.absent ?? 0,
            color: "#DC2626",
          },
        ],
      });
      charts.push({
        title: "تسجيل الحضور حسب الصفوف",
        items: [
          {
            label: "سُجل الحضور",
            value: stats.attendance.markedClasses ?? 0,
            color: "#036A87",
          },
          {
            label: "إجمالي الصفوف",
            value: stats.attendance.totalClasses ?? 0,
            color: "#1E40AF",
          },
        ],
      });
    }

    if (has("attendance.reports.view")) {
      charts.push({
        title: "تقارير الغياب المتكرر",
        items: [
          {
            label: "تقارير الغياب المتكرر",
            value: stats.repeatedAbsenceReports ?? 0,
            color: "#B45309",
          },
        ],
      });
    }

    return charts;
  };

  const exportDashboardXlsx = async () => {
    try {
      const sections = getExportSections();
      await downloadXlsx(
        `dashboard-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
        sections.map((section) => ({
          name: section.title,
          rows: [section.headers, ...section.rows],
        })),
      );
    } catch {
      toast.error("تعذر تصدير التقرير إلى Excel");
    }
  };

  const exportDashboardPdf = () => {
    try {
      if (!printChartReport("تقرير لوحة التحكم", filterSummary, getChartExportSections())) {
        toast.error("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير");
      }
    } catch {
      toast.error("تعذر تجهيز التقرير للطباعة");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/dashboard/filters", { signal: controller.signal })
      .then((response) => setFilterOptions(response.data))
      .catch((error) => {
        if (error?.code !== "ERR_CANCELED") setErr("تعذر تحميل خيارات التصفية");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErr("");
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value),
    );
    api
      .get("/dashboard/stats", {
        params,
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
  }, [filters]);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">لوحة التحكم</h1>
          <p className="text-sm text-gray-500 mt-1">
            نظرة عامة على تسجيلات الطلاب
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
          role="group"
          aria-label="طريقة عرض لوحة التحكم"
        >
          <button
            type="button"
            onClick={() => changeViewMode("numbers")}
            aria-pressed={viewMode === "numbers"}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              viewMode === "numbers"
                ? "bg-[#036A87] text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            أرقام
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("charts")}
            aria-pressed={viewMode === "charts"}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              viewMode === "charts"
                ? "bg-[#036A87] text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            رسوم بيانية
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportDashboardPdf}
            disabled={!stats || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            PDF
          </button>
          <button
            type="button"
            onClick={exportDashboardXlsx}
            disabled={!stats || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            تصفية الإحصائيات
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            تتحدث الإحصائيات تلقائياً عند تغيير أي خيار.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-gray-600">
            الصف
            <select
              value={filters.classId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  classId: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              <option value="">كل الصفوف</option>
              {filterOptions.classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {[classItem.name, classItem.grade, classItem.section]
                    .filter(Boolean)
                    .join(" - ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            العام الدراسي
            <select
              value={filters.academicYear}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  academicYear: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              <option value="">كل الأعوام</option>
              {filterOptions.academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            الجنس
            <select
              value={filters.gender}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  gender: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              <option value="">الكل</option>
              <option value="male">ذكور</option>
              <option value="female">إناث</option>
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            مسار التسجيل النهائي
            <select
              value={filters.finalRegistrationPath}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  finalRegistrationPath: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              <option value="">كل المسارات</option>
              {filterOptions.registrationPaths.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </label>
        </div>
        {Object.values(filters).some(Boolean) && (
          <button
            type="button"
            onClick={() =>
              setFilters({
                classId: "",
                academicYear: "",
                gender: "",
                finalRegistrationPath: "",
              })
            }
            className="mt-3 text-xs font-medium text-[#036A87] hover:underline"
          >
            مسح التصفية
          </button>
        )}
      </section>

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

          {viewMode === "charts" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  توزيع الطلاب حسب الجنس
                </h3>
                <DashboardDonut
                  data={[
                    {
                      label: "الطالبات",
                      value: Number(stats?.female ?? 0),
                      color: "#B4356D",
                    },
                    {
                      label: "الطلاب الذكور",
                      value: Number(stats?.male ?? 0),
                      color: "#1E40AF",
                    },
                  ]}
                  total={Number(stats?.total ?? 0)}
                  centerLabel="إجمالي الطلاب"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                title="إجمالي الطلاب"
                value={loading ? "…" : (stats?.total ?? 0)}
                icon={Users}
                tint={{ bg: "#E0F9FF", fg: "#036A87" }}
                testid="stat-total"
                to={studentListLink()}
              />

              <StatCard
                title="الطالبات"
                value={loading ? "…" : (stats?.female ?? 0)}
                icon={User}
                tint={{ bg: "#FDE9F1", fg: "#B4356D" }}
                testid="stat-female"
                to={studentListLink({ gender: "female" })}
              />
              <StatCard
                title="الطلاب الذكور"
                value={loading ? "…" : (stats?.male ?? 0)}
                icon={UserCheck}
                tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
                testid="stat-male"
                to={studentListLink({ gender: "male" })}
              />
            </div>
          )}

          {viewMode !== "charts" && (
            <h3 className="mb-3 mt-5 text-sm font-semibold text-gray-700">
              الطلاب حسب المسار
            </h3>
          )}
          {viewMode === "charts" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  الطلاب حسب المسار
                </h3>
                <DashboardChart
                  data={(stats?.studentPaths || []).map((item) => ({
                    label: item.path,
                    total: Number(item.total ?? 0),
                  }))}
                  series={[{ key: "total", name: "عدد الطلاب" }]}
                />
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  المنسحبون حسب المسار
                </h3>
                <DashboardChart
                  data={(stats?.studentPaths || []).map((item) => ({
                    label: item.path,
                    dropped: Number(item.dropped ?? 0),
                  }))}
                  series={[
                    {
                      key: "dropped",
                      name: "عدد المنسحبين",
                      color: CHART_COLORS[3],
                    },
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(stats?.studentPaths || []).map((pathStats, index) => (
                <StatCard
                  key={pathStats.path}
                  title={`طلاب المسار: ${pathStats.path}`}
                  value={loading ? "…" : pathStats.total}
                  icon={Users}
                  tint={{ bg: "#E0F9FF", fg: "#036A87" }}
                  testid={`stat-path-students-${index}`}
                  to={studentListLink({
                    finalRegistrationPath: pathStats.path,
                  })}
                />
              ))}
            </div>
          )}

          {viewMode !== "charts" && (
            <>
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
                    to={studentListLink({
                      finalRegistrationPath: pathStats.path,
                      status: "inactive",
                    })}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {has("teachers.view") && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                إحصائيات المعلمين
              </h2>
            </div>
            {viewMode === "charts" ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    توزيع المعلمين حسب الجنس
                  </h3>
                  <DashboardDonut
                    data={[
                      {
                        label: "المعلمات",
                        value: Number(stats?.teacherStats?.female ?? 0),
                        color: "#B4356D",
                      },
                      {
                        label: "المعلمون الذكور",
                        value: Number(stats?.teacherStats?.male ?? 0),
                        color: "#1E40AF",
                      },
                    ]}
                    total={Number(stats?.teacherStats?.total ?? 0)}
                    centerLabel="إجمالي المعلمين"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  title="إجمالي المعلمين"
                  value={loading ? "…" : (stats?.teacherStats?.total ?? 0)}
                  icon={Users}
                  tint={{ bg: "#E0F9FF", fg: "#036A87" }}
                  testid="stat-teachers-total"
                  to={teacherListLink()}
                />
                <StatCard
                  title="المعلمات"
                  value={loading ? "…" : (stats?.teacherStats?.female ?? 0)}
                  icon={User}
                  tint={{ bg: "#FDE9F1", fg: "#B4356D" }}
                  testid="stat-teachers-female"
                  to={teacherListLink("female")}
                />
                <StatCard
                  title="المعلمون الذكور"
                  value={loading ? "…" : (stats?.teacherStats?.male ?? 0)}
                  icon={UserCheck}
                  tint={{ bg: "#E6EEFB", fg: "#1E40AF" }}
                  testid="stat-teachers-male"
                  to={teacherListLink("male")}
                />
              </div>
            )}
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
                <div
                  className={
                    viewMode === "charts"
                      ? "grid grid-cols-1 gap-4 lg:grid-cols-2"
                      : "space-y-5"
                  }
                >
                  <FinanceRow
                    title="الرسوم الدراسية"
                    totals={stats?.finance?.all?.academic}
                    loading={loading}
                    testid="stat-finance-all-academic"
                    payableIcon={BookOpen}
                    viewMode={viewMode}
                  />
                  <FinanceRow
                    title="رسوم الحافلة"
                    totals={stats?.finance?.all?.transportation}
                    loading={loading}
                    testid="stat-finance-all-bus"
                    payableIcon={Bus}
                    viewMode={viewMode}
                  />
                </div>
              </div>

              {(stats?.finance?.byPath || []).map((pathStats, index) => (
                <div key={pathStats.path}>
                  <h3 className="mb-4 text-base font-semibold text-gray-800">
                    مسار {pathStats.path}
                  </h3>
                  <div
                    className={
                      viewMode === "charts"
                        ? "grid grid-cols-1 gap-4 lg:grid-cols-2"
                        : "space-y-5"
                    }
                  >
                    <FinanceRow
                      title="الرسوم الدراسية"
                      totals={pathStats.academic}
                      loading={loading}
                      testid={`stat-finance-path-${index}-academic`}
                      payableIcon={BookOpen}
                      viewMode={viewMode}
                    />
                    <FinanceRow
                      title="رسوم الحافلة"
                      totals={pathStats.transportation}
                      loading={loading}
                      testid={`stat-finance-path-${index}-bus`}
                      payableIcon={Bus}
                      viewMode={viewMode}
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
            {viewMode === "charts" ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    حالة حضور الطلاب
                  </h3>
                  <p className="text-xs text-gray-500">
                    نسبة الحضور: {stats?.attendance?.attendanceRate ?? 0}%
                  </p>
                  <DashboardDonut
                    data={[
                      {
                        label: "حاضرون",
                        value: Math.max(
                          0,
                          Number(stats?.attendance?.present ?? 0) -
                            Number(stats?.attendance?.late ?? 0),
                        ),
                        color: "#16A34A",
                      },
                      {
                        label: "متأخرون",
                        value: Number(stats?.attendance?.late ?? 0),
                        color: "#F59E0B",
                      },
                      {
                        label: "غائبون",
                        value: Number(stats?.attendance?.absent ?? 0),
                        color: "#DC2626",
                      },
                    ]}
                    total={
                      Number(stats?.attendance?.present ?? 0) +
                      Number(stats?.attendance?.absent ?? 0)
                    }
                    centerLabel="سجلات الحضور"
                  />
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    تسجيل الحضور حسب الصفوف
                  </h3>
                  <DashboardChart
                    data={[
                      {
                        label: "سُجل الحضور",
                        value: Number(stats?.attendance?.markedClasses ?? 0),
                      },
                      {
                        label: "إجمالي الصفوف",
                        value: Number(stats?.attendance?.totalClasses ?? 0),
                      },
                    ]}
                    series={[{ key: "value", name: "عدد الصفوف" }]}
                  />
                </div>
              </div>
            ) : (
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
            )}
          </section>
        )}

        {has("attendance.reports.view") &&
          (viewMode === "charts" ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-gray-900">
                تقارير الغياب المتكرر
              </h2>
              <DashboardChart
                data={[
                  {
                    label: "تقارير الغياب المتكرر",
                    value: Number(stats?.repeatedAbsenceReports ?? 0),
                  },
                ]}
                series={[
                  {
                    key: "value",
                    name: "عدد التقارير",
                    color: CHART_COLORS[3],
                  },
                ]}
                height={140}
              />
              <Link
                to="/attendance?tab=reports"
                className="text-sm font-medium text-[#036A87] hover:underline"
                data-testid="stat-repeated-absence-reports"
              >
                فتح التقارير
              </Link>
            </section>
          ) : (
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
          ))}
      </div>
    </div>
  );
}
