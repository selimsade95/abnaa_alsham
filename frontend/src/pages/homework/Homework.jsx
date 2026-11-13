import { useEffect, useState } from "react";
import {
  ClipboardList,
  FileSpreadsheet,
  Filter,
  Loader2,
  Printer,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { getIntlLocale } from "@/i18n";
import { downloadXlsx, localDateStamp, printReport } from "@/lib/reportExport";
import { useTranslation } from "react-i18next";

export default function Homework() {
  const { t } = useTranslation();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    api
      .get("/homework")
      .then((response) => setRecords(response.data))
      .catch((error) => {
        toast.error(
          error?.response?.data?.detail || "تعذر تحميل الواجبات غير المنجزة",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const classes = [
    ...new Set(records.map((record) => record.className).filter(Boolean)),
  ].sort();
  const subjects = [
    ...new Set(records.map((record) => record.subjectName).filter(Boolean)),
  ].sort();
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredRecords = records.filter((record) => {
    const matchesSearch =
      !normalizedSearch ||
      [
        record.className,
        record.subjectName,
        record.studentName,
        record.studentCode,
        record.teacherName,
      ].some((value) =>
        String(value || "")
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      );
    return (
      matchesSearch &&
      (!classFilter || record.className === classFilter) &&
      (!subjectFilter || record.subjectName === subjectFilter) &&
      (!dateFrom || record.homeworkDate >= dateFrom) &&
      (!dateTo || record.homeworkDate <= dateTo)
    );
  });
  const hasFilters =
    search || classFilter || subjectFilter || dateFrom || dateTo;
  const clearFilters = () => {
    setSearch("");
    setClassFilter("");
    setSubjectFilter("");
    setDateFrom("");
    setDateTo("");
  };
  const reportTitle = t("homeworkPage.reportTitle");
  const reportRows = filteredRecords.map((record) => [
    record.homeworkDate
      ? new Date(`${record.homeworkDate}T00:00:00`).toLocaleDateString(
          getIntlLocale(),
        )
      : "—",
    record.className || "—",
    record.subjectName || "—",
    record.studentName || "—",
    record.studentCode || "—",
    record.teacherName || "—",
    t("homeworkPage.notCompleted"),
  ]);
  const reportHeaders = [
    t("homeworkPage.date"),
    t("homeworkPage.class"),
    t("homeworkPage.subject"),
    t("homeworkPage.student"),
    t("homeworkPage.studentCode"),
    t("homeworkPage.teacher"),
    t("homeworkPage.status"),
  ];
  const reportSubtitle =
    [
      search.trim() && `${t("homeworkPage.search")}: ${search.trim()}`,
      classFilter && `${t("homeworkPage.class")}: ${classFilter}`,
      subjectFilter && `${t("homeworkPage.subject")}: ${subjectFilter}`,
      dateFrom && `${t("homeworkPage.from")}: ${dateFrom}`,
      dateTo && `${t("homeworkPage.to")}: ${dateTo}`,
    ]
      .filter(Boolean)
      .join(" · ") || t("homeworkPage.allRecords");

  const exportExcel = async () => {
    try {
      await downloadXlsx(`homework-report-${localDateStamp()}.xlsx`, [
        {
          name: reportTitle,
          rows: [reportHeaders, ...reportRows],
        },
      ]);
    } catch {
      toast.error(t("homeworkPage.exportExcelFailed"));
    }
  };

  const exportPdf = () => {
    try {
      if (
        !printReport(reportTitle, reportSubtitle, [
          { title: reportTitle, headers: reportHeaders, rows: reportRows },
        ])
      ) {
        toast.error(t("homeworkPage.printFailed"));
      }
    } catch {
      toast.error(t("homeworkPage.printFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">الواجبات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            قائمة الطلاب الذين لم يؤدوا واجباتهم.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportPdf}
            disabled={loading || !filteredRecords.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> {t("homeworkPage.exportPdf")}
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={loading || !filteredRecords.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />{" "}
            {t("homeworkPage.exportExcel")}
          </button>
        </div>
      </div>
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم الطالب أو رمزه أو المادة..."
              aria-label="البحث في الواجبات"
              className="w-full rounded-lg border border-input py-2 pe-9 ps-3 text-sm"
            />
          </div>
          <select
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
            aria-label="تصفية حسب الصف"
            className="rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">كل الصفوف</option>
            {classes.map((className) => (
              <option key={className} value={className}>
                {className}
              </option>
            ))}
          </select>
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            aria-label="تصفية حسب المادة"
            className="rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">كل المواد</option>
            {subjects.map((subjectName) => (
              <option key={subjectName} value={subjectName}>
                {subjectName}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">من تاريخ</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-input px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">إلى تاريخ</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-input px-3 py-2"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              {loading ? "جاري التحميل..." : `${filteredRecords.length} واجب`}
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-sm text-accent-foreground hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                مسح الفلاتر
              </button>
            )}
          </div>
        </div>
      </section>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3">التاريخ</th>
              <th className="px-4 py-3">الصف</th>
              <th className="px-4 py-3">المادة</th>
              <th className="px-4 py-3">الطالب</th>
              <th className="px-4 py-3">المعلم</th>
              <th className="px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                  جاري تحميل الواجبات...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <ClipboardList className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  لا توجد واجبات غير منجزة.
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  لا توجد واجبات مطابقة للبحث والفلاتر المحددة.
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => (
                <tr key={record.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {record.homeworkDate
                      ? new Date(
                          `${record.homeworkDate}T00:00:00`,
                        ).toLocaleDateString(getIntlLocale())
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {record.className || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {record.subjectName || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-medium">
                      {record.studentName || "—"}
                    </div>
                    {record.studentCode && (
                      <div className="font-mono text-xs text-muted-foreground">
                        {record.studentCode}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {record.teacherName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                      لم يؤد الواجب
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
