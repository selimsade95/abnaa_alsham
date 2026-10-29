import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import {
  CalendarRange,
  ChevronDown,
  FileSpreadsheet,
  Loader2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { i18n } from "@/i18n";
import { downloadXlsx, localDateStamp, printReport } from "@/lib/reportExport";

const PAYMENT_TYPES = ["all", "academic", "transportation", "books", "outfit"];

const money = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const westernDigits = (value) =>
  String(value ?? "").replace(/[٠-٩۰-۹]/g, (digit) =>
    String.fromCharCode(
      digit >= "۰"
        ? digit.charCodeAt(0) - "۰".charCodeAt(0) + 48
        : digit.charCodeAt(0) - "٠".charCodeAt(0) + 48,
    ),
  );

const DataTable = ({ headers, rows, emptyMessage }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-start text-sm">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          {headers.map((header) => (
            <th key={header} className="px-4 py-3 font-medium text-start">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((row, index) => (
            <tr key={row.key || index} className="border-t border-gray-100">
              {row.cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top">
                  {typeof cell === "string" || typeof cell === "number"
                    ? westernDigits(cell)
                    : cell ?? "—"}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td
              colSpan={headers.length}
              className="px-4 py-8 text-center text-gray-500"
            >
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const Panel = ({ title, description, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          {description && (
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          )}
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {children}
    </details>
  );
};

export default function Reports() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [month, setMonth] = useState("");
  const [paymentType, setPaymentType] = useState("all");
  const [course, setCourse] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [report, setReport] = useState(null);
  const [overview, setOverview] = useState(null);
  const tr = (key, options) => i18n.t(`reports.${key}`, options);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/reports/overview", { signal: controller.signal })
      .then((response) => setOverview(response.data))
      .catch((error) => {
        if (error?.code !== "ERR_CANCELED") toast.error(tr("loadOverviewFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOverview(false);
      });
    return () => controller.abort();
  }, []);

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
          toast.error(tr("loadPaymentsFailed"));
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
  const counts = overview?.counts || {};
  const distributions = overview?.distributions || {};
  const financial = overview?.financial || {};
  const activePeriodLabel = useMemo(() => {
    if (month) return tr("month", { 0: month });
    if (dateFrom || dateTo)
      return tr("periodRange", { 0: dateFrom || tr("start"), 1: dateTo || tr("now") });
    return tr("allPeriods");
  }, [dateFrom, dateTo, month, i18n.language]);

  const paymentTypeLabel = (type) => tr(`paymentType_${type}`);
  const exportSections = () => {
    if (!overview || !report) return null;
    const sections = [
      {
        title: tr("studentCounts"),
        headers: [tr("metric"), tr("value")],
        rows: [
          [tr("numberOfStudents"), counts.registered ?? 0],
          [tr("registeredStudents"), counts.registered ?? 0],
          [tr("activeStudentsTotal"), counts.active ?? 0],
          [tr("inactiveStudentsTotal"), counts.inactive ?? 0],
        ],
      },
      {
        title: tr("distributionByGrade"),
        headers: [tr("grade"), tr("students")],
        rows: (distributions.byGrade || []).map((row) => [row.grade, row.students]),
      },
      {
        title: tr("distributionByGender"),
        headers: [tr("gender"), tr("students")],
        rows: (distributions.byGender || []).map((row) => [
          row.gender === "male"
            ? tr("male")
            : row.gender === "female"
              ? tr("female")
              : tr("unspecified"),
          row.students,
        ]),
      },
      {
        title: tr("distributionByPath"),
        headers: [tr("path"), tr("students")],
        rows: (distributions.byPath || []).map((row) => [row.path, row.students]),
      },
      {
        title: tr("financialByGrade"),
        headers: [tr("grade"), tr("students"), tr("payable"), tr("collected"), tr("remaining")],
        rows: (financial.byGrade || []).map((row) => [
          row.grade, row.students, row.payable, row.collected, row.remaining,
        ]),
      },
      {
        title: tr("totalFinancialReport"),
        headers: [tr("feeType"), tr("payable"), tr("collected"), tr("remaining")],
        rows: [[tr("allFees"), financial.total?.payable, financial.total?.collected, financial.total?.remaining]],
      },
      {
        title: tr("monthlyCollections"),
        headers: [tr("monthColumn"), tr("collected")],
        rows: (financial.monthly || []).map((row) => [row.month, row.total]),
      },
      {
        title: tr("transportationStatement"),
        headers: [tr("metric"), tr("value")],
        rows: [
          [tr("payable"), financial.transportation?.payable],
          [tr("collected"), financial.transportation?.collected],
          [tr("remaining"), financial.transportation?.remaining],
        ],
      },
      {
        title: tr("withdrawnFinancialStatus"),
        headers: [tr("student"), tr("grade"), tr("payable"), tr("collected"), tr("remaining")],
        rows: (financial.withdrawnStudents || []).map((row) => [
          row.name, row.grade, row.payable, row.collected, row.remaining,
        ]),
      },
      {
        title: tr("withdrawnWithReasons"),
        headers: [tr("student"), tr("grade"), tr("withdrawalReason")],
        rows: (financial.withdrawnStudents || []).map((row) => [row.name, row.grade, row.reason || tr("noReasonRecorded")]),
      },
      {
        title: tr("remainingInstallments"),
        headers: [tr("semester"), tr("installmentAmount"), tr("paid"), tr("remaining")],
        rows: [
          [tr("firstSemester"), financial.installments?.firstSemesterPayable, financial.installments?.firstSemesterPaid, financial.installments?.firstSemesterRemaining],
          [tr("secondSemester"), financial.installments?.secondSemesterPayable, financial.installments?.secondSemesterPaid, financial.installments?.secondSemesterRemaining],
        ],
      },
      {
        title: tr("installmentsPerGrade"),
        headers: [tr("grade"), tr("studentsRequiredToPay")],
        rows: (financial.requiredInstallmentsByGrade || []).map((row) => [row.grade, row.students]),
      },
      {
        title: tr("annualAmountPerStudent"),
        headers: [tr("student"), tr("grade"), tr("annualAmount")],
        rows: (financial.annualAmounts || []).map((row) => [row.name, row.grade, row.annualAmount]),
      },
      {
        title: tr("discountsGranted"),
        headers: [tr("student"), tr("grade"), tr("discountName"), tr("percentage"), tr("reason")],
        rows: (financial.discounts || []).map((row) => [row.name, row.grade, row.nameOfDiscount || tr("unnamedDiscount"), row.percentage, row.reason]),
      },
    ];
    sections.push(
      financial.sponsorshipAvailable
        ? {
            title: tr("sponsorObligations"),
            headers: [tr("sponsor"), tr("students"), tr("obligation"), tr("collected"), tr("remaining")],
            rows: (financial.sponsorship || []).map((row) => [row.name, row.students, row.payable, row.collected, row.remaining]),
          }
        : {
            title: tr("sponsorObligations"),
            headers: [tr("details")],
            rows: [[tr("sponsorDataUnavailable")]],
          },
    );
    if (!financial.installmentScheduleAvailable) {
      sections.push({
        title: tr("installmentNotes"),
        headers: [tr("details")],
        rows: [[tr("installmentScheduleUnavailable")]],
      });
    }
    sections.push({
      title: tr("filteredPaymentReport"),
      headers: [tr("metric"), tr("value")],
      rows: [
        [tr("period"), activePeriodLabel],
        [tr("paymentType"), paymentTypeLabel(paymentType)],
        [tr("students"), summary.totalStudents ?? 0],
        [tr("fullyPaidStudents"), summary.paid ?? 0],
        [tr("partiallyPaidStudents"), summary.partial ?? 0],
        [tr("unpaidStudents"), summary.unpaid ?? 0],
        [tr("totalPayable"), summary.totalPayable ?? 0],
        [tr("totalCollected"), summary.totalCollected ?? 0],
        [tr("remaining"), summary.totalRemaining ?? 0],
      ],
    });
    sections.push({
      title: tr("filteredByPath"),
      headers: [tr("path"), tr("payable"), tr("collected"), tr("remaining"), tr("fullyPaidStudents"), tr("partiallyPaidStudents"), tr("unpaidStudents")],
      rows: byCourse.map((row) => [row.course, row.payable, row.collected, row.remaining, row.paidStudents, row.partialStudents, row.unpaidStudents]),
    });
    return sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) =>
        row.map((cell) => (typeof cell === "string" ? westernDigits(cell) : cell)),
      ),
    }));
  };

  const exportXlsx = async () => {
    try {
      const sections = exportSections();
      if (!sections) return;
      await downloadXlsx(
        `school-reports-${localDateStamp()}.xlsx`,
        sections.map((section) => ({
          name: section.title,
          rows: [section.headers, ...section.rows],
        })),
      );
    } catch {
      toast.error(tr("exportExcelFailed"));
    }
  };

  const exportPdf = () => {
    try {
      const sections = exportSections();
      if (!sections) return;
      if (!printReport(tr("financialReport"), activePeriodLabel, sections)) {
        toast.error(tr("popupPrintPermission"));
      }
    } catch {
      toast.error(tr("printReportFailed"));
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
        <div className="mt-2 text-2xl font-extrabold tabular-nums">
          {typeof value === "string" ? westernDigits(value) : value}
        </div>
      </div>
    );
  };

  const distributionRows = (items, key, labelForValue = (value) => value) =>
    (items || []).map((row) => ({
      key: row[key],
      cells: [labelForValue(row[key]), row.students],
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{tr("financialReport")}</h1>
          <p className="mt-1 text-sm text-gray-500">{tr("reportsDescription")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportPdf}
            disabled={!overview || !report || loading || loadingOverview}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> PDF
          </button>
          <button
            onClick={exportXlsx}
            disabled={!overview || !report || loading || loadingOverview}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>
      </div>

      {loadingOverview ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          <div className="mt-2">{tr("loadingOverview")}</div>
        </div>
      ) : overview ? (
        <>
          <Panel title={tr("studentCounts")}>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label={tr("numberOfStudents")} value={counts.registered ?? 0} />
              <StatCard label={tr("registeredStudents")} value={counts.registered ?? 0} tone="slate" />
              <StatCard label={tr("activeStudentsTotal")} value={counts.active ?? 0} tone="green" />
              <StatCard label={tr("inactiveStudentsTotal")} value={counts.inactive ?? 0} tone="amber" />
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title={tr("distributionByGrade")}>
              <DataTable
                headers={[tr("grade"), tr("students")]}
                rows={distributionRows(distributions.byGrade, "grade", (value) => value === "__unspecified__" ? tr("unspecified") : value)}
                emptyMessage={tr("noReportData")}
              />
            </Panel>
            <Panel title={tr("distributionByGender")}>
              <DataTable
                headers={[tr("gender"), tr("students")]}
                rows={distributionRows(distributions.byGender, "gender", (value) => value === "male" ? tr("male") : value === "female" ? tr("female") : tr("unspecified"))}
                emptyMessage={tr("noReportData")}
              />
            </Panel>
            <Panel title={tr("distributionByPath")}>
              <DataTable
                headers={[tr("path"), tr("students")]}
                rows={distributionRows(distributions.byPath, "path", (value) => value === "__unspecified__" ? tr("unspecified") : value)}
                emptyMessage={tr("noReportData")}
              />
            </Panel>
          </div>

          <Panel title={tr("financialByGrade")}>
            <DataTable
              headers={[tr("grade"), tr("students"), tr("payable"), tr("collected"), tr("remaining")]}
              rows={(financial.byGrade || []).map((row) => ({
                key: row.grade,
                cells: [row.grade, row.students, `${money(row.payable)} $`, `${money(row.collected)} $`, `${money(row.remaining)} $`],
              }))}
              emptyMessage={tr("noReportData")}
            />
          </Panel>

          <Panel title={tr("totalFinancialReport")}>
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
              <StatCard label={tr("payable")} value={`${money(financial.total?.payable)} $`} />
              <StatCard label={tr("collected")} value={`${money(financial.total?.collected)} $`} tone="green" />
              <StatCard label={tr("remaining")} value={`${money(financial.total?.remaining)} $`} tone="amber" />
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title={tr("monthlyCollections")}>
              <DataTable
                headers={[tr("monthColumn"), tr("collected")]}
                rows={(financial.monthly || []).map((row) => ({
                  key: row.month,
                  cells: [row.month === "__unknown__" ? tr("unknownMonth") : row.month, `${money(row.total)} $`],
                }))}
                emptyMessage={tr("noReportData")}
              />
            </Panel>
            <Panel title={tr("transportationStatement")}>
              <div className="grid grid-cols-3 gap-2 p-4">
                <StatCard label={tr("payable")} value={`${money(financial.transportation?.payable)} $`} />
                <StatCard label={tr("collected")} value={`${money(financial.transportation?.collected)} $`} tone="green" />
                <StatCard label={tr("remaining")} value={`${money(financial.transportation?.remaining)} $`} tone="amber" />
              </div>
              <DataTable
                headers={[tr("monthColumn"), tr("collected")]}
                rows={(financial.monthly || []).filter((row) => row.transportation !== 0).map((row) => ({
                  key: row.month,
                  cells: [row.month === "__unknown__" ? tr("unknownMonth") : row.month, `${money(row.transportation)} $`],
                }))}
                emptyMessage={tr("noReportData")}
              />
            </Panel>
          </div>

          <Panel
            title={tr("sponsorObligations")}
            description={tr("sponsorDataUnavailable")}
          >
            <DataTable
              headers={[tr("sponsor"), tr("students"), tr("obligation"), tr("collected"), tr("remaining")]}
              rows={(financial.sponsorship || []).map((row) => ({
                key: row.id || row.name,
                cells: [row.name, row.students, `${money(row.payable)} $`, `${money(row.collected)} $`, `${money(row.remaining)} $`],
              }))}
              emptyMessage={tr("sponsorDataUnavailable")}
            />
          </Panel>

          <Panel title={tr("withdrawnFinancialStatus")}>
            <DataTable
              headers={[tr("student"), tr("grade"), tr("payable"), tr("collected"), tr("remaining")]}
              rows={(financial.withdrawnStudents || []).map((row) => ({
                key: row.studentId,
                cells: [row.name, row.grade === "__unspecified__" ? tr("unspecified") : row.grade, `${money(row.payable)} $`, `${money(row.collected)} $`, `${money(row.remaining)} $`],
              }))}
              emptyMessage={tr("noReportData")}
            />
          </Panel>

          <Panel title={tr("withdrawnWithReasons")}>
            <DataTable
              headers={[tr("student"), tr("grade"), tr("withdrawalReason")]}
              rows={(financial.withdrawnStudents || []).map((row) => ({
                key: row.studentId,
                cells: [row.name, row.grade === "__unspecified__" ? tr("unspecified") : row.grade, row.reason || tr("noReasonRecorded")],
              }))}
              emptyMessage={tr("noReportData")}
            />
          </Panel>

          <Panel
            title={tr("remainingInstallments")}
            description={financial.installmentScheduleAvailable ? "" : tr("installmentScheduleUnavailable")}
          >
            <DataTable
              headers={[tr("semester"), tr("installmentAmount"), tr("paid"), tr("remaining")]}
              rows={[
                { key: "first", cells: [tr("firstSemester"), `${money(financial.installments?.firstSemesterPayable)} $`, `${money(financial.installments?.firstSemesterPaid)} $`, `${money(financial.installments?.firstSemesterRemaining)} $`] },
                { key: "second", cells: [tr("secondSemester"), `${money(financial.installments?.secondSemesterPayable)} $`, `${money(financial.installments?.secondSemesterPaid)} $`, `${money(financial.installments?.secondSemesterRemaining)} $`] },
              ]}
              emptyMessage={tr("noReportData")}
            />
          </Panel>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title={tr("installmentsPerGrade")}>
              <DataTable
                headers={[tr("grade"), tr("studentsRequiredToPay")]}
                rows={(financial.requiredInstallmentsByGrade || []).map((row) => ({
                  key: row.grade,
                  cells: [row.grade === "__unspecified__" ? tr("unspecified") : row.grade, row.students],
                }))}
                emptyMessage={tr("noReportData")}
              />
            </Panel>
            <Panel title={tr("annualAmountPerStudent")}>
              <DataTable
                headers={[tr("student"), tr("grade"), tr("annualAmount")]}
                rows={(financial.annualAmounts || []).map((row) => ({
                  key: row.studentId,
                  cells: [row.name, row.grade === "__unspecified__" ? tr("unspecified") : row.grade, `${money(row.annualAmount)} $`],
                }))}
                emptyMessage={tr("noReportData")}
              />
            </Panel>
          </div>

          <Panel title={tr("discountsGranted")}>
            <DataTable
              headers={[tr("student"), tr("grade"), tr("discountName"), tr("percentage"), tr("reason")]}
              rows={(financial.discounts || []).map((row, index) => ({
                key: `${row.studentId}-${index}`,
                cells: [row.name, row.grade === "__unspecified__" ? tr("unspecified") : row.grade, row.nameOfDiscount || tr("unnamedDiscount"), `${money(row.percentage)}%`, row.reason === "general" ? tr("generalDiscountReason") : row.reason === "siblings_staff" ? tr("siblingStaffDiscountReason") : row.reason],
              }))}
              emptyMessage={tr("noReportData")}
            />
          </Panel>
        </>
      ) : null}

      <Panel title={tr("reportFilter")}>
        <div className="p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm text-gray-700">
            {tr("monthLabel")}
            <input
              type="month"
              lang="en"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                if (event.target.value) {
                  setDateFrom("");
                  setDateTo("");
                }
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm text-gray-700">
            {tr("from")}
            <input
              type="date"
              lang="en"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                if (event.target.value) setMonth("");
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm text-gray-700">
            {tr("to")}
            <input
              type="date"
              lang="en"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                if (event.target.value) setMonth("");
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm text-gray-700">
            {tr("paymentType")}
            <select
              value={paymentType}
              onChange={(event) => setPaymentType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              {PAYMENT_TYPES.map((type) => (
                <option key={type} value={type}>{paymentTypeLabel(type)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            {tr("path")}
            <input
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              placeholder={tr("searchPath")}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
        </div>
        </div>
      </Panel>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          <div className="mt-2">{tr("loadingReport")}</div>
        </div>
      ) : report ? (
        <>
          <Panel title={tr("filteredPaymentReport")}>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarRange className="h-4 w-4" />
            <span>{activePeriodLabel}</span>
            <span className="rounded-full bg-sky-50 px-2 py-1 font-medium text-sky-700">
              {paymentTypeLabel(paymentType)}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label={tr("fullyPaidStudents")} value={summary.paid ?? 0} tone="green" />
            <StatCard label={tr("partiallyPaidStudents")} value={summary.partial ?? 0} tone="amber" />
            <StatCard label={tr("unpaidStudents")} value={summary.unpaid ?? 0} tone="rose" />
            <StatCard label={tr("inactiveStudents")} value={summary.dropped ?? 0} tone="slate" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <StatCard label={tr("totalCollected")} value={`${money(summary.totalCollected)} $`} tone="green" />
            <StatCard label={tr("remaining")} value={`${money(summary.totalRemaining)} $`} tone="amber" />
            <StatCard label={tr("payable")} value={`${money(summary.totalPayable)} $`} />
          </div>
          </Panel>
          <Panel title={tr("filteredByPath")}>
            <DataTable
              headers={[tr("path"), tr("payable"), tr("collected"), tr("remaining"), tr("fullyPaidStudents"), tr("partiallyPaidStudents"), tr("unpaidStudents")]}
              rows={byCourse.map((row) => ({
                key: row.course,
                cells: [row.course, `${money(row.payable)} $`, `${money(row.collected)} $`, `${money(row.remaining)} $`, row.paidStudents, row.partialStudents, row.unpaidStudents],
              }))}
              emptyMessage={tr("noReportData")}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
