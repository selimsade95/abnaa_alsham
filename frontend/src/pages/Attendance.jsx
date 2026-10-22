import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  Loader2,
  Printer,
  Save,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSearchParams } from "react-router-dom";
import { getIntlLocale } from "@/i18n";

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const dateLabel = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(getIntlLocale());

export default function Attendance() {
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
        (student.status !== "present" ||
          student.lateMinutes == null ||
          (Number.isInteger(Number(student.lateMinutes)) &&
            Number(student.lateMinutes) > 0)),
    );

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
    if (!allMarked) return;
    setSaving(true);
    try {
      await api.put(`/attendance/classes/${classId}`, {
        attendanceDate,
        records: students.map(
          ({ studentId, status, absenceReason, lateMinutes }) => ({
            studentId,
            status,
            absenceReason: status === "absent" ? absenceReason : null,
            lateMinutes:
              status === "present" && lateMinutes ? Number(lateMinutes) : null,
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
          <h1 className="text-3xl font-bold text-gray-900">حضور الطلاب</h1>
          <p className="mt-1 text-sm text-gray-500">
            تسجيل حضور الصف مرة واحدة لكل يوم ومتابعة حالات الغياب المتكرر.
          </p>
        </div>
        {tab === "reports" && canPrintReports && (
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-2 rounded-lg bg-[#036A87] px-4 py-2 text-sm font-semibold text-white hover:bg-[#02556D]"
          >
            <Printer className="h-4 w-4" /> طباعة التقرير
          </button>
        )}
      </header>

      <div className="no-print flex flex-wrap gap-2 border-b border-gray-200">
        {canViewAttendance && (
          <button
            type="button"
            onClick={() => setTab("attendance")}
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              tab === "attendance"
                ? "border-[#04A9CE] text-[#036A87]"
                : "border-transparent text-gray-500 hover:text-gray-800"
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
                ? "border-[#04A9CE] text-[#036A87]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            تقارير الغياب المتكرر
          </button>
        )}
      </div>

      {tab === "attendance" && canViewAttendance && (
        <>
          <section className="no-print grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              الصف
              <select
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
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
            <label className="text-sm font-medium text-gray-700">
              التاريخ
              <input
                type="date"
                value={attendanceDate}
                max={localDateValue()}
                onChange={(event) => setAttendanceDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {className || "قائمة الصف"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {attendanceDate ? dateLabel(attendanceDate) : "اختر التاريخ"}
                  {markedAt && " · تم تسجيل الحضور لهذا اليوم"}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="rounded-lg bg-green-50 px-3 py-2 text-green-800">
                  حاضر: {presentCount}
                </span>
                <span className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
                  غائب: {absentCount}
                </span>
                <span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  متأخر: {lateCount}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
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
                        className="px-4 py-12 text-center text-gray-500"
                      >
                        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                        جاري تحميل الطلاب...
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-gray-500"
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
                        className="border-t border-gray-100"
                      >
                        <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {student.studentCode || "—"}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {student.studentName}
                        </td>
                        <td className="px-4 py-3">
                          {canManage ? (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    markStudent(student.studentId, "present")
                                  }
                                  aria-pressed={student.status === "present"}
                                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                                    student.status === "present"
                                      ? "bg-green-600 text-white"
                                      : "bg-green-50 text-green-800 hover:bg-green-100"
                                  }`}
                                >
                                  <Check className="h-3.5 w-3.5" /> حاضر
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    markStudent(student.studentId, "absent")
                                  }
                                  aria-pressed={student.status === "absent"}
                                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                                    student.status === "absent"
                                      ? "bg-red-600 text-white"
                                      : "bg-red-50 text-red-800 hover:bg-red-100"
                                  }`}
                                >
                                  <X className="h-3.5 w-3.5" /> غائب
                                </button>
                              </div>
                              {student.status === "absent" && (
                                <div className="flex flex-wrap gap-3 text-xs">
                                  {[
                                    ["excused", "بعذر"],
                                    ["unexcused", "دون عذر"],
                                  ].map(([reason, label]) => (
                                    <label
                                      key={reason}
                                      className="inline-flex items-center gap-1.5 text-gray-700"
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
                              {student.status === "present" && (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <label className="inline-flex items-center gap-1.5 text-gray-700">
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
                                    <label className="inline-flex items-center gap-1 text-gray-600">
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
                                        className="w-20 rounded border border-gray-300 px-2 py-1"
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
                                    : student.status === "absent"
                                      ? "bg-red-50 text-red-800"
                                      : "text-gray-400"
                                }`}
                              >
                                {student.status === "present"
                                  ? "حاضر"
                                  : student.status === "absent"
                                    ? "غائب"
                                    : "لم يسجل"}
                              </span>
                              {student.status === "absent" &&
                                student.absenceReason && (
                                  <div className="text-xs text-gray-500">
                                    {student.absenceReason === "excused"
                                      ? "بعذر"
                                      : "دون عذر"}
                                  </div>
                                )}
                              {student.status === "present" &&
                                student.lateMinutes != null && (
                                  <div className="text-xs text-amber-700">
                                    متأخر {student.lateMinutes} دقيقة
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
                className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 p-4"
              >
                <p className="text-xs text-gray-500">
                  يمكن تصحيح سجل اليوم؛ لكل صف سجل حضور واحد في اليوم.
                </p>
                <button
                  type="submit"
                  disabled={saving || attendanceLoading || !allMarked}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#04A9CE] px-4 py-2 text-sm font-semibold text-white hover:bg-[#038BAB] disabled:cursor-not-allowed disabled:opacity-50"
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
          <section className="no-print grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-medium text-gray-700">
              من تاريخ (اختياري)
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              إلى تاريخ (اختياري)
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              يظهر الطالب بعد {threshold} غيابات
            </div>
          </section>
          <section className="print-area rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4">
              <div>
                <h2 className="font-semibold text-gray-900">
                  سجل الغياب المتكرر
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {reports.length} طالب ضمن معايير التقرير
                </p>
              </div>
              <Users className="h-5 w-5 text-gray-400" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
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
                        className="px-4 py-12 text-center text-gray-500"
                      >
                        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                        جاري إعداد التقرير...
                      </td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-gray-500"
                      >
                        لا توجد حالات غياب متكرر ضمن الفترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    reports.map((report) => (
                      <tr
                        key={report.studentId}
                        className="border-t border-gray-100 align-top"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {report.studentName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
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
                                {absence.reason &&
                                  ` · ${absence.reason === "excused" ? "بعذر" : "دون عذر"}`}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
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
