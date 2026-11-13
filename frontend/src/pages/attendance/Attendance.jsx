import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCheck,
  Loader2,
  Printer,
  Save,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSearchParams } from "react-router-dom";
import { getIntlLocale } from "@/i18n";
import ConfirmAction from "@/components/ConfirmAction";

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const dateLabel = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(getIntlLocale());

export default function Attendance() {
  const { t } = useTranslation();
  const at = (key, options) => t(`attendance.${key}`, options);
  const { has, hasAny } = useAuth();
  const [searchParams] = useSearchParams();
  const canViewAttendance = hasAny(["attendance.view", "attendance.manage"]);
  const canManage = has("attendance.manage");
  const canViewReports = has("attendance.reports.view");
  const canPrintReports = has("attendance.reports.print");
  const [tab, setTab] = useState(
    searchParams.get("tab") === "reports" && canViewReports
      ? "reports"
      : canViewAttendance
        ? "attendance"
        : "reports",
  );
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(localDateValue());
  const [students, setStudents] = useState([]);
  const [className, setClassName] = useState("");
  const [markedAt, setMarkedAt] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedRoster, setLoadedRoster] = useState(null);
  const [confirmAllPresent, setConfirmAllPresent] = useState(false);
  const [reports, setReports] = useState([]);
  const [threshold, setThreshold] = useState(3);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const attendanceRequest = useRef(0);
  const reportsRequest = useRef(0);

  useEffect(() => {
    if (!canViewAttendance) return;
    api
      .get("/attendance/classes")
      .then((response) => {
        const availableClasses = response.data || [];
        setClasses(availableClasses);
        setClassId((previous) => previous || availableClasses[0]?.id || "");
      })
      .catch((error) =>
        toast.error(error?.response?.data?.detail || "تعذر تحميل الصفوف"),
      );
  }, [canViewAttendance]);

  const loadAttendance = useCallback(async () => {
    const requestId = ++attendanceRequest.current;
    setLoadedRoster(null);
    if (!classId || !attendanceDate) {
      setStudents([]);
      setClassName("");
      setMarkedAt(null);
      setAttendanceLoading(false);
      return;
    }
    setAttendanceLoading(true);
    try {
      const response = await api.get(`/attendance/classes/${classId}`, {
        params: { date: attendanceDate },
      });
      if (requestId !== attendanceRequest.current) return;
      setStudents(response.data.students || []);
      setClassName(response.data.className || "");
      setMarkedAt(response.data.markedAt || null);
      setLoadedRoster({ classId, attendanceDate });
    } catch (error) {
      if (requestId === attendanceRequest.current)
        toast.error(error?.response?.data?.detail || "تعذر تحميل سجل الحضور");
    } finally {
      if (requestId === attendanceRequest.current) setAttendanceLoading(false);
    }
  }, [attendanceDate, classId]);

  useEffect(() => {
    if (canViewAttendance && tab === "attendance") loadAttendance();
  }, [canViewAttendance, loadAttendance, tab]);

  const loadReports = useCallback(async () => {
    const requestId = ++reportsRequest.current;
    setReportsLoading(true);
    try {
      const params = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const response = await api.get("/attendance/reports", { params });
      if (requestId !== reportsRequest.current) return;
      setReports(response.data.reports || []);
      setThreshold(response.data.threshold || 3);
    } catch (error) {
      if (requestId === reportsRequest.current)
        toast.error(
          error?.response?.data?.detail || "تعذر تحميل تقارير الغياب",
        );
    } finally {
      if (requestId === reportsRequest.current) setReportsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (canViewReports && tab === "reports") loadReports();
  }, [canViewReports, loadReports, tab]);

  const absentCount = useMemo(
    () => students.filter((student) => student.status === "absent").length,
    [students],
  );
  const earlyDismissalCount = useMemo(
    () =>
      students.filter((student) => student.status === "early_dismissal").length,
    [students],
  );
  const truancyCount = useMemo(
    () => students.filter((student) => student.status === "truancy").length,
    [students],
  );
  const presentCount = useMemo(
    () => students.filter((student) => student.status === "present").length,
    [students],
  );
  const lateCount = useMemo(
    () =>
      students.filter(
        (student) =>
          student.status === "present" && Number(student.lateMinutes) > 0,
      ).length,
    [students],
  );
  const allMarked =
    students.length > 0 &&
    students.every(
      (student) =>
        student.status &&
        (student.status !== "absent" ||
          ["excused", "unexcused"].includes(student.absenceReason)) &&
        (student.status !== "early_dismissal" ||
          (student.earlyDismissalReason?.trim() &&
            student.earlyDismissalRelation &&
            student.earlyDismissalBy?.trim())) &&
        (student.status !== "present" ||
          student.lateMinutes == null ||
          (Number.isInteger(Number(student.lateMinutes)) &&
            Number(student.lateMinutes) > 0)),
    );
  const rosterReady = !attendanceLoading &&
    loadedRoster?.classId === classId && loadedRoster?.attendanceDate === attendanceDate;
  const canMarkAll = canManage && rosterReady && !saving && students.length > 0;

  const markAllPresent = () => {
    if (!canMarkAll) return;
    setStudents((previous) => previous.map((student) => ({
      ...student,
      status: "present",
      absenceReason: null,
      lateMinutes: null,
      earlyDismissalReason: "",
      earlyDismissalRelation: "",
      earlyDismissalBy: "",
    })));
  };

  const markStudent = (studentId, status) =>
    setStudents((previous) =>
      previous.map((student) =>
        student.studentId === studentId
          ? {
              ...student,
              status,
              absenceReason:
                student.status === status ? student.absenceReason : null,
              lateMinutes:
                student.status === status ? student.lateMinutes : null,
              earlyDismissalReason:
                student.status === status ? student.earlyDismissalReason : "",
              earlyDismissalRelation:
                student.status === status ? student.earlyDismissalRelation : "",
              earlyDismissalBy:
                student.status === status ? student.earlyDismissalBy : "",
            }
          : student,
      ),
    );
  const updateStudent = (studentId, updates) =>
    setStudents((previous) =>
      previous.map((student) =>
        student.studentId === studentId ? { ...student, ...updates } : student,
      ),
    );

  const saveAttendance = async (event) => {
    event.preventDefault();
    if (!canManage || !rosterReady || saving || !allMarked) return;
    setSaving(true);
    try {
      await api.put(`/attendance/classes/${classId}`, {
        attendanceDate,
        records: students.map(
          ({
            studentId,
            status,
            absenceReason,
            lateMinutes,
            earlyDismissalReason,
            earlyDismissalRelation,
            earlyDismissalBy,
          }) => ({
            studentId,
            status,
            absenceReason: status === "absent" ? absenceReason : null,
            lateMinutes:
              status === "present" && lateMinutes ? Number(lateMinutes) : null,
            earlyDismissalReason:
              status === "early_dismissal" ? earlyDismissalReason : null,
            earlyDismissalRelation:
              status === "early_dismissal" ? earlyDismissalRelation : null,
            earlyDismissalBy:
              status === "early_dismissal" ? earlyDismissalBy : null,
          }),
        ),
      });
      toast.success("تم حفظ الحضور");
      await loadAttendance();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر حفظ الحضور");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">حضور الطلاب</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تسجيل حضور الصف مرة واحدة لكل يوم ومتابعة حالات الغياب المتكرر.
          </p>
        </div>
        {tab === "reports" && canPrintReports && (
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            <Printer className="h-4 w-4" /> طباعة التقرير
          </button>
        )}
      </header>

      <div className="no-print flex flex-wrap gap-2 border-b border-border">
        {canViewAttendance && (
          <button
            type="button"
            onClick={() => setTab("attendance")}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              tab === "attendance"
                ? "border-ring text-accent-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            تسجيل الحضور
          </button>
        )}
        {canViewReports && (
          <button
            type="button"
            onClick={() => setTab("reports")}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              tab === "reports"
                ? "border-ring text-accent-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            تقارير الغياب المتكرر
          </button>
        )}
      </div>

      {tab === "attendance" && canViewAttendance && (
        <>
          <section className="no-print grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2">
            <label className="text-sm font-medium text-foreground">
              الصف
              <select
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2"
                disabled={!classes.length}
              >
                <option value="">اختر الصف</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.section ? ` - ${item.section}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-foreground">
              التاريخ
              <input
                type="date"
                value={attendanceDate}
                max={localDateValue()}
                onChange={(event) => setAttendanceDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input px-3 py-2"
              />
            </label>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {className || "قائمة الصف"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {attendanceDate ? dateLabel(attendanceDate) : "اختر التاريخ"}
                  {markedAt && " · تم تسجيل الحضور لهذا اليوم"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {canManage && (
                  <button type="button" disabled={!canMarkAll}
                    className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 font-semibold text-accent-foreground hover:bg-accent disabled:opacity-50"
                    onClick={() => {
                      if (students.some((student) =>
                        (student.status && student.status !== "present") || Number(student.lateMinutes) > 0
                      )) setConfirmAllPresent(true);
                      else markAllPresent();
                    }}>
                    <CheckCheck className="h-4 w-4" aria-hidden="true" />
                    {at("markAllPresent")}
                  </button>
                )}
                <span className="rounded-lg bg-green-50 px-3 py-2 text-green-800">
                  {at("presentCount", { 0: presentCount })}
                </span>
                <span className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
                  {at("absentCount", { 0: absentCount })}
                </span>
                <span className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800">
                  {at("earlyDismissalCount", { 0: earlyDismissalCount })}
                </span>
                <span className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
                  {at("truancyCount", { 0: truancyCount })}
                </span>
                <span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  {at("lateCount", { 0: lateCount })}
                </span>
              </div>
            </div>
            <ConfirmAction
              action={confirmAllPresent ? {
                title: at("markAllPresent"),
                description: at("markAllPresentConfirm"),
                label: at("markAllPresent"),
                run: markAllPresent,
              } : null}
              onClose={() => setConfirmAllPresent(false)}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">الرمز</th>
                    <th className="px-4 py-3">اسم الطالب</th>
                    <th className="px-4 py-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLoading ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                        جاري تحميل الطلاب...
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        {classId
                          ? "لا يوجد طلاب نشطون في هذا الصف."
                          : "اختر صفاً لعرض الطلاب."}
                      </td>
                    </tr>
                  ) : (
                    students.map((student, index) => (
                      <tr
                        key={student.studentId}
                        className="border-t border-border"
                      >
                        <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {student.studentCode || "—"}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {student.studentName}
                        </td>
                        <td className="px-4 py-3">
                          {canManage ? (
                            <div className="space-y-2">
                              <select
                                value={student.status || ""}
                                onChange={(event) =>
                                  markStudent(
                                    student.studentId,
                                    event.target.value,
                                  )
                                }
                                aria-label={`${at("statusForStudent")} ${student.studentName}`}
                                className="w-full max-w-xs rounded-md border border-input bg-card px-3 py-2 text-sm"
                              >
                                <option value="">{at("chooseStatus")}</option>
                                {[
                                  "present",
                                  "absent",
                                  "early_dismissal",
                                  "truancy",
                                ].map((status) => (
                                  <option key={status} value={status}>
                                    {at(status)}
                                  </option>
                                ))}
                              </select>
                              {student.status === "absent" && (
                                <div className="flex flex-wrap gap-3 text-xs">
                                  {[
                                    ["excused", at("excused")],
                                    ["unexcused", at("unexcused")],
                                  ].map(([reason, label]) => (
                                    <label
                                      key={reason}
                                      className="inline-flex items-center gap-1.5 text-foreground"
                                    >
                                      <input
                                        type="radio"
                                        name={`absence-reason-${student.studentId}`}
                                        checked={
                                          student.absenceReason === reason
                                        }
                                        onChange={() =>
                                          updateStudent(student.studentId, {
                                            absenceReason: reason,
                                          })
                                        }
                                        className="accent-[#04CDF9]"
                                      />
                                      {label}
                                    </label>
                                  ))}
                                </div>
                              )}
                              {student.status === "early_dismissal" && (
                                <div className="grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                                  <label className="text-xs text-muted-foreground sm:col-span-2">
                                    {at("earlyDismissalReason")}
                                    <textarea
                                      required
                                      maxLength={1000}
                                      value={student.earlyDismissalReason || ""}
                                      onChange={(event) =>
                                        updateStudent(student.studentId, {
                                          earlyDismissalReason:
                                            event.target.value,
                                        })
                                      }
                                      className="mt-1 w-full rounded border border-input px-2 py-1.5"
                                    />
                                  </label>
                                  <label className="text-xs text-muted-foreground">
                                    {at("earlyDismissalRelation")}
                                    <select
                                      required
                                      value={
                                        student.earlyDismissalRelation || ""
                                      }
                                      onChange={(event) =>
                                        updateStudent(student.studentId, {
                                          earlyDismissalRelation:
                                            event.target.value,
                                        })
                                      }
                                      className="mt-1 w-full rounded border border-input bg-card px-2 py-1.5"
                                    >
                                      <option value="">
                                        {at("selectRelation")}
                                      </option>
                                      {[
                                        "father",
                                        "mother",
                                        "relative",
                                        "guardian",
                                        "other",
                                      ].map((relation) => (
                                        <option key={relation} value={relation}>
                                          {at(relation)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="text-xs text-muted-foreground">
                                    {at("earlyDismissalBy")}
                                    <input
                                      required
                                      maxLength={160}
                                      value={student.earlyDismissalBy || ""}
                                      onChange={(event) =>
                                        updateStudent(student.studentId, {
                                          earlyDismissalBy: event.target.value,
                                        })
                                      }
                                      className="mt-1 w-full rounded border border-input px-2 py-1.5"
                                    />
                                  </label>
                                </div>
                              )}
                              {student.status === "truancy" && (
                                <p className="text-xs text-rose-700">
                                  {at("truancyHelp")}
                                </p>
                              )}
                              {student.status === "present" && (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <label className="inline-flex items-center gap-1.5 text-foreground">
                                    <input
                                      type="checkbox"
                                      checked={student.lateMinutes != null}
                                      onChange={(event) =>
                                        updateStudent(student.studentId, {
                                          lateMinutes: event.target.checked
                                            ? ""
                                            : null,
                                        })
                                      }
                                      className="accent-[#04CDF9]"
                                    />
                                    متأخر
                                  </label>
                                  {student.lateMinutes != null && (
                                    <label className="inline-flex items-center gap-1 text-muted-foreground">
                                      <input
                                        type="number"
                                        min="1"
                                        max="1440"
                                        step="1"
                                        required
                                        value={student.lateMinutes}
                                        onChange={(event) =>
                                          updateStudent(student.studentId, {
                                            lateMinutes: event.target.value,
                                          })
                                        }
                                        aria-label={`مدة التأخر بالدقائق للطالب ${student.studentName}`}
                                        className="w-20 rounded border border-input px-2 py-1"
                                      />
                                      دقيقة
                                    </label>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span
                                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                                  student.status === "present"
                                    ? "bg-green-50 text-green-800"
                                    : ["absent", "truancy"].includes(
                                          student.status,
                                        )
                                      ? "bg-red-50 text-red-800"
                                      : student.status === "early_dismissal"
                                        ? "bg-sky-50 text-sky-800"
                                        : "text-muted-foreground"
                                }`}
                              >
                                {student.status
                                  ? at(student.status)
                                  : at("notRecorded")}
                              </span>
                              {student.status === "absent" &&
                                student.absenceReason && (
                                  <div className="text-xs text-muted-foreground">
                                    {student.absenceReason === "excused"
                                      ? at("excused")
                                      : at("unexcused")}
                                  </div>
                                )}
                              {student.status === "early_dismissal" && (
                                <div className="text-xs text-muted-foreground">
                                  {student.earlyDismissalReason} ·{" "}
                                  {at(student.earlyDismissalRelation)}:{" "}
                                  {student.earlyDismissalBy}
                                </div>
                              )}
                              {student.status === "present" &&
                                student.lateMinutes != null && (
                                  <div className="text-xs text-amber-700">
                                    {at("lateMinutesLabel", {
                                      0: student.lateMinutes,
                                    })}
                                  </div>
                                )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {canManage && students.length > 0 && (
              <form
                onSubmit={saveAttendance}
                className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"
              >
                <p className="text-xs text-muted-foreground">
                  يمكن تصحيح سجل اليوم؛ لكل صف سجل حضور واحد في اليوم.
                </p>
                <button
                  type="submit"
                  disabled={saving || !rosterReady || !allMarked}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {markedAt ? "تحديث سجل اليوم" : "حفظ الحضور"}
                </button>
              </form>
            )}
          </section>
        </>
      )}

      {tab === "reports" && canViewReports && (
        <>
          <section className="no-print grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-medium text-foreground">
              من تاريخ (اختياري)
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              إلى تاريخ (اختياري)
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 w-full rounded-lg border border-input px-3 py-2"
              />
            </label>
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              يظهر الطالب بعد {threshold} غيابات
            </div>
          </section>
          <section className="print-area rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="font-semibold text-foreground">
                  سجل الغياب المتكرر
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {reports.length} طالب ضمن معايير التقرير
                </p>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">الطالب</th>
                    <th className="px-4 py-3">الرمز</th>
                    <th className="px-4 py-3">عدد الغيابات</th>
                    <th className="px-4 py-3">تواريخ الغياب والصفوف</th>
                    <th className="px-4 py-3">آخر غياب</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                        جاري إعداد التقرير...
                      </td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        لا توجد حالات غياب متكرر ضمن الفترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    reports.map((report) => (
                      <tr
                        key={report.studentId}
                        className="border-t border-border align-top"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {report.studentName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {report.studentCode || "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-red-700">
                          {report.absenceCount}
                        </td>
                        <td className="px-4 py-3">
                          <ul className="space-y-1">
                            {report.absences.map((absence, index) => (
                              <li
                                key={`${absence.date}-${absence.classId}-${index}`}
                              >
                                {dateLabel(absence.date)} · {absence.className}
                                {absence.status === "truancy"
                                  ? ` · ${at("truancy")}`
                                  : absence.reason
                                    ? ` · ${at(absence.reason)}`
                                    : ""}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {dateLabel(report.lastAbsenceDate)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
