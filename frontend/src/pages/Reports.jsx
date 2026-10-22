import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import {
  BarChart3,
  CalendarRange,
  FileSpreadsheet,
  Loader2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { downloadXlsx, printReport } from "@/lib/reportExport";

const PAYMENT_TYPE_LABELS = {
  all: "الكل",
  academic: "أكاديمي",
  transportation: "النقل",
  books: "الكتب",
  outfit: "الملابس",
};

const money = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Reports() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [month, setMonth] = useState("");
  const [paymentType, setPaymentType] = useState("all");
  const [course, setCourse] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const params = {};
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (month) params.month = month;
        if (paymentType) params.paymentType = paymentType;
        if (course) params.course = course;
        const response = await api.get("/reports/finance", {
          params,
          signal: controller.signal,
        });
        setReport(response.data);
      } catch (error) {
        if (error?.code !== "ERR_CANCELED") {
          toast.error("تعذر تحميل تقارير المدفوعات");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [dateFrom, dateTo, month, paymentType, course]);

  const summary = report?.summary || {};
  const byCourse = report?.byCourse || [];
  const activePeriodLabel = useMemo(() => {
    if (month) return `شهر ${month}`;
    if (dateFrom || dateTo)
      return `${dateFrom || "بداية"} إلى ${dateTo || "الآن"}`;
    return "كل الفترات";
  }, [dateFrom, dateTo, month]);

  const getExportSections = () => {
    if (!report) return;
    return [
      {
        title: "ملخص التقرير المالي",
        headers: ["المؤشر", "القيمة"],
        rows: [
          ["الفترة", activePeriodLabel],
          ["نوع الدفع", PAYMENT_TYPE_LABELS[paymentType] || "الكل"],
          ["الطلاب", summary.totalStudents ?? 0],
          ["طلاب بدفع كامل", summary.paid ?? 0],
          ["طلاب بدفع جزئي", summary.partial ?? 0],
          ["طلاب بدون دفع", summary.unpaid ?? 0],
          ["الطلاب المتوقفون", summary.dropped ?? 0],
          ["إجمالي المستحق", summary.totalPayable ?? 0],
          ["إجمالي المحصل", summary.totalCollected ?? 0],
          ["إجمالي المتبقي", summary.totalRemaining ?? 0],
        ],
      },
      {
        title: "التقرير حسب المسار",
        headers: [
          "المسار",
          "إجمالي المستحق",
          "المبلغ المحصل",
          "المتبقي",
          "الطلاب المدفوعين",
          "الطلاب الجزئيين",
          "الطلاب غير المدفوعين",
        ],
        rows: byCourse.map((item) => [
          item.course,
          item.payable,
          item.collected,
          item.remaining,
          item.paidStudents,
          item.partialStudents,
          item.unpaidStudents,
        ]),
      },
    ];
  };

  const exportXlsx = async () => {
    try {
      const sections = getExportSections();
      if (!sections) return;
      await downloadXlsx(
        `financial-report-${paymentType || "all"}.xlsx`,
        sections.map((section) => ({
          name: section.title,
          rows: [section.headers, ...section.rows],
        })),
      );
    } catch {
      toast.error("تعذر تصدير التقرير إلى Excel");
    }
  };

  const exportPdf = () => {
    try {
      const sections = getExportSections();
      if (!sections) return;
      if (
        !printReport(
          "التقرير المالي",
          `${activePeriodLabel} - ${PAYMENT_TYPE_LABELS[paymentType] || "الكل"}${course ? ` - ${course}` : ""}`,
          sections,
        )
      ) {
        toast.error("يرجى السماح بالنوافذ المنبثقة لطباعة التقرير");
      }
    } catch {
      toast.error("تعذر تجهيز التقرير للطباعة");
    }
  };

  const StatCard = ({ label, value, tone = "sky" }) => {
    const tones = {
      sky: "bg-sky-50 text-sky-700 border-sky-200",
      green: "bg-emerald-50 text-emerald-700 border-emerald-200",
      amber: "bg-amber-50 text-amber-700 border-amber-200",
      rose: "bg-rose-50 text-rose-700 border-rose-200",
      slate: "bg-slate-50 text-slate-700 border-slate-200",
    };
    return (
      <div className={`rounded-xl border p-4 ${tones[tone] || tones.sky}`}>
        <div className="text-xs font-medium opacity-80">{label}</div>
        <div className="mt-2 text-2xl font-extrabold tabular-nums">{value}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">التقارير</h1>
          <p className="text-sm text-gray-500 mt-1">
            ملخص مالي للطلاب حسب الفترة ونوع الدفع والمسار
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportPdf}
            disabled={!report || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> PDF
          </button>
          <button
            onClick={exportXlsx}
            disabled={!report || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-gray-800">
          <BarChart3 className="h-5 w-5 text-[#036A87]" />
          <h2 className="text-lg font-semibold">فلتر التقرير</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm text-gray-700">
            الشهر
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                if (e.target.value) {
                  setDateFrom("");
                  setDateTo("");
                }
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm text-gray-700">
            من
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                if (e.target.value) setMonth("");
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm text-gray-700">
            إلى
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                if (e.target.value) setMonth("");
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm text-gray-700">
            نوع الدفع
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              {Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            المسار
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="ابحث عن مسار"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          <div className="mt-2">جاري تجهيز التقرير...</div>
        </div>
      ) : report ? (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarRange className="h-4 w-4" />
            <span>{activePeriodLabel}</span>
            <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700 font-medium">
              {PAYMENT_TYPE_LABELS[paymentType] || "الكل"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="طلاب بدفع كامل"
              value={summary.paid ?? 0}
              tone="green"
            />
            <StatCard
              label="طلاب بدفع جزئي"
              value={summary.partial ?? 0}
              tone="amber"
            />
            <StatCard
              label="طلاب بدون دفع"
              value={summary.unpaid ?? 0}
              tone="rose"
            />
            <StatCard
              label="الطلاب المتوقفين"
              value={summary.dropped ?? 0}
              tone="slate"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StatCard
              label="إجمالي المحصل"
              value={`${money(summary.totalCollected ?? 0)} $`}
              tone="green"
            />
            <StatCard
              label="إجمالي المتبقي"
              value={`${money(summary.totalRemaining ?? 0)} $`}
              tone="amber"
            />
            <StatCard
              label="إجمالي المستحق"
              value={`${money(summary.totalPayable ?? 0)} $`}
              tone="sky"
            />
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
              <h3 className="font-semibold text-gray-800">
                التقرير حسب المسار
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">المسار</th>
                    <th className="px-4 py-3 font-medium">المستحق</th>
                    <th className="px-4 py-3 font-medium">المحصل</th>
                    <th className="px-4 py-3 font-medium">المتبقي</th>
                    <th className="px-4 py-3 font-medium">مدفوع</th>
                    <th className="px-4 py-3 font-medium">جزئي</th>
                    <th className="px-4 py-3 font-medium">غير مدفوع</th>
                  </tr>
                </thead>
                <tbody>
                  {byCourse.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        لا توجد بيانات لهذا التقرير.
                      </td>
                    </tr>
                  ) : (
                    byCourse.map((item) => (
                      <tr
                        key={item.course}
                        className="border-t border-gray-100"
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {item.course}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {money(item.payable)} $
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {money(item.collected)} $
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {money(item.remaining)} $
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {item.paidStudents}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {item.partialStudents}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {item.unpaidStudents}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
