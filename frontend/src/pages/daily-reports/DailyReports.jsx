import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getIntlLocale } from "@/i18n";

const emptyDraft = {
  absences: [],
  schoolFlow: "",
  firstBreakNotes: "",
  secondBreakNotes: "",
  notes: "",
};

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateLabel(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(getIntlLocale());
}

function timestampLabel(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleString(getIntlLocale());
}

export default function DailyReports() {
  const { t } = useTranslation();
  const { has, hasAny } = useAuth();
  const canCreate = has("dailyReports.create");
  const canUpdate = has("dailyReports.update");
  const canPrint = has("dailyReports.print");
  const canAccess = hasAny([
    "dailyReports.view",
    "dailyReports.create",
    "dailyReports.update",
    "dailyReports.print",
  ]);
  const [classes, setClasses] = useState([]);
  const [classKey, setClassKey] = useState("");
  const [classId, setClassId] = useState("");
  const [reportDate, setReportDate] = useState(localDateValue());
  const [report, setReport] = useState(null);
  const [students, setStudents] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [newAbsentId, setNewAbsentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  const classGroups = useMemo(() => {
    const groups = new Map();
    classes.forEach((item) => {
      const key = `${item.grade || ""}::${item.name}`;
      if (!groups.has(key))
        groups.set(key, {
          key,
          name: item.name,
          grade: item.grade,
          divisions: [],
        });
      groups.get(key).divisions.push(item);
    });
    return [...groups.values()];
  }, [classes]);
  const selectedGroup = classGroups.find((group) => group.key === classKey);
  const selectedClass = classes.find((item) => item.id === classId);
  const editable = report ? canUpdate : canCreate;
  const absentStudentIds = useMemo(
    () => new Set(draft.absences.map((absence) => absence.studentId)),
    [draft.absences],
  );
  const selectableAbsentStudents = students.filter(
    (student) => !absentStudentIds.has(student.studentId),
  );
  const displayCounts = {
    attended: students.length - draft.absences.length,
    absent: draft.absences.length,
    total: students.length,
  };
  const validAbsences = draft.absences.every(
    (absence) =>
      ["excused", "unexcused"].includes(absence.absenceReason) &&
      (absence.absenceReason !== "excused" || absence.excuseReason?.trim()),
  );

  useEffect(() => {
    if (!canAccess) return;
    api
      .get("/daily-reports/classes")
      .then((response) => {
        const availableClasses = response.data || [];
        setClasses(availableClasses);
        const firstGroup = new Map();
        availableClasses.forEach((item) => {
          const key = `${item.grade || ""}::${item.name}`;
          if (!firstGroup.has(key)) firstGroup.set(key, item);
        });
        const first = firstGroup.entries().next().value;
        if (first) {
          setClassKey((previous) => previous || first[0]);
          setClassId((previous) => previous || first[1].id);
        }
      })
      .catch((error) =>
        toast.error(
          error?.response?.data?.detail || t("dailyReport.loadClassesError"),
        ),
      );
  }, [canAccess, t]);

  const loadReport = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!classId || !reportDate) {
      setReport(null);
      setStudents([]);
      setDraft(emptyDraft);
      return;
    }
    setLoading(true);
    setReport(null);
    setStudents([]);
    setDraft(emptyDraft);
    try {
      const response = await api.get(`/daily-reports/${classId}`, {
        params: { date: reportDate },
      });
      if (currentRequest !== requestId.current) return;
      const data = response.data;
      setReport(data.report || null);
      setStudents(data.students || []);
      setDraft({
        ...emptyDraft,
        ...(data.report || {}),
        absences: data.report?.absences || [],
      });
      setNewAbsentId("");
    } catch (error) {
      if (currentRequest === requestId.current) {
        toast.error(
          error?.response?.data?.detail || t("dailyReport.loadError"),
        );
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [classId, reportDate, t]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const updateDraft = (field, value) =>
    setDraft((previous) => ({ ...previous, [field]: value }));

  const addAbsentStudent = () => {
    if (!newAbsentId) return;
    setDraft((previous) => ({
      ...previous,
      absences: [
        ...previous.absences,
        { studentId: newAbsentId, absenceReason: "", excuseReason: "" },
      ],
    }));
    setNewAbsentId("");
  };

  const updateAbsence = (studentId, updates) =>
    setDraft((previous) => ({
      ...previous,
      absences: previous.absences.map((absence) =>
        absence.studentId === studentId ? { ...absence, ...updates } : absence,
      ),
    }));

  const removeAbsence = (studentId) =>
    setDraft((previous) => ({
      ...previous,
      absences: previous.absences.filter(
        (absence) => absence.studentId !== studentId,
      ),
    }));

  const saveReport = async (event) => {
    event.preventDefault();
    if (!validAbsences || !editable) return;
    setSaving(true);
    const payload = {
      classId,
      reportDate,
      absences: draft.absences.map(
        ({ studentId, absenceReason, excuseReason }) => ({
          studentId,
          absenceReason,
          excuseReason:
            absenceReason === "excused" ? excuseReason?.trim() : null,
        }),
      ),
      schoolFlow: draft.schoolFlow,
      firstBreakNotes: draft.firstBreakNotes,
      secondBreakNotes: draft.secondBreakNotes,
      notes: draft.notes,
    };
    try {
      if (report) {
        await api.put(`/daily-reports/${classId}`, payload);
      } else {
        await api.post("/daily-reports", payload);
      }
      toast.success(t("dailyReport.saveSuccess"));
      await loadReport();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t("dailyReport.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("dailyReport.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dailyReport.description")}
          </p>
        </div>
        {report && canPrint && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            <Printer className="h-4 w-4" />
            {t("dailyReport.print")}
          </button>
        )}
      </header>

      <section className="no-print grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-3">
        <label className="text-sm font-medium text-foreground">
          {t("dailyReport.class")}
          <select
            value={classKey}
            onChange={(event) => {
              const nextGroup = classGroups.find(
                (group) => group.key === event.target.value,
              );
              setClassKey(event.target.value);
              setClassId(nextGroup?.divisions[0]?.id || "");
            }}
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2"
            disabled={!classGroups.length}
          >
            <option value="">{t("dailyReport.chooseClass")}</option>
            {classGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.name}
                {group.grade ? ` (${group.grade})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-foreground">
          {t("dailyReport.division")}
          <select
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2"
            disabled={!selectedGroup?.divisions.length}
          >
            <option value="">{t("dailyReport.chooseDivision")}</option>
            {(selectedGroup?.divisions || []).map((division) => (
              <option key={division.id} value={division.id}>
                {division.section || t("dailyReport.defaultDivision")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-foreground">
          {t("dailyReport.date")}
          <input
            type="date"
            value={reportDate}
            max={localDateValue()}
            onChange={(event) => setReportDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input px-3 py-2"
          />
        </label>
      </section>

      <form onSubmit={saveReport} className="space-y-6">
        <section className="print-area rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {t("dailyReport.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedClass?.name || "—"}
                {selectedClass?.section ? ` · ${selectedClass.section}` : ""}
                {reportDate ? ` · ${dateLabel(reportDate)}` : ""}
              </p>
            </div>
            {report?.updatedAt && (
              <p className="text-sm text-muted-foreground">
                {t("dailyReport.lastUpdated")}:{" "}
                {timestampLabel(report.updatedAt)}
                {report.updatedByName ? ` · ${report.updatedByName}` : ""}
              </p>
            )}
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {[
              [
                "attended",
                t("dailyReport.attended"),
                "bg-green-50 text-green-800",
              ],
              ["absent", t("dailyReport.absent"), "bg-red-50 text-red-800"],
              ["total", t("dailyReport.total"), "bg-sky-50 text-sky-800"],
            ].map(([key, label, colors]) => (
              <label
                key={key}
                className={`daily-report-stat-card daily-report-stat-${key} rounded-lg p-3 text-sm font-medium ${colors}`}
              >
                {label}
                <input
                  type="number"
                  value={displayCounts[key]}
                  readOnly
                  className="mt-1 block w-full rounded-md border border-current/20 bg-card/70 px-3 py-2 text-lg font-bold"
                />
              </label>
            ))}
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-semibold text-foreground">
                {t("dailyReport.absentNames")}
              </h3>
              {editable && (
                <div className="no-print flex flex-1 gap-2 sm:max-w-lg">
                  <select
                    value={newAbsentId}
                    onChange={(event) => setNewAbsentId(event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
                  >
                    <option value="">{t("dailyReport.chooseStudent")}</option>
                    {selectableAbsentStudents.map((student) => (
                      <option key={student.studentId} value={student.studentId}>
                        {student.studentName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addAbsentStudent}
                    disabled={!newAbsentId}
                    className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {t("dailyReport.addAbsent")}
                  </button>
                </div>
              )}
            </div>
            {draft.absences.length ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-start text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="text-start px-4 py-2">
                        {t("dailyReport.studentName")}
                      </th>
                      <th className="text-start px-4 py-2">
                        {t("dailyReport.absenceType")}
                      </th>
                      {editable && (
                        <th className="text-start no-print px-4 py-2">
                          {t("general.actions")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.absences.map((absence) => {
                      const student = students.find(
                        (item) => item.studentId === absence.studentId,
                      );
                      return (
                        <tr
                          key={absence.studentId}
                          className="border-t border-border"
                        >
                          <td className="px-4 py-2 font-medium text-foreground">
                            {student?.studentName || absence.studentName || "—"}
                          </td>
                          <td className="px-4 py-2">
                            {editable && (
                              <div className="no-print flex w-full items-center gap-2">
                                <select
                                  value={absence.absenceReason || ""}
                                  onChange={(event) =>
                                    updateAbsence(absence.studentId, {
                                      absenceReason: event.target.value,
                                      excuseReason:
                                        event.target.value === "excused"
                                          ? absence.excuseReason || ""
                                          : "",
                                    })
                                  }
                                  required
                                  className="w-1/4 rounded-md border border-input bg-card px-3 py-1.5 text-sm"
                                >
                                  <option value="">
                                    {t("dailyReport.chooseAbsenceType")}
                                  </option>
                                  <option value="excused">
                                    {t("dailyReport.excused")}
                                  </option>
                                  <option value="unexcused">
                                    {t("dailyReport.unexcused")}
                                  </option>
                                </select>

                                {absence.absenceReason === "excused" && (
                                  <div className="flex-1">
                                    <input
                                      type="text"
                                      value={absence.excuseReason || ""}
                                      onChange={(event) =>
                                        updateAbsence(absence.studentId, {
                                          excuseReason: event.target.value,
                                        })
                                      }
                                      placeholder={t(
                                        "dailyReport.excuseReason",
                                      )}
                                      maxLength={1000}
                                      required
                                      className="w-full rounded-md border border-input px-3 py-1.5 text-sm"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            <span
                              className={
                                editable ? "daily-report-print-text" : "inline"
                              }
                            >
                              {absence.absenceReason === "excused"
                                ? `${t("dailyReport.excused")}: ${
                                    absence.excuseReason?.trim() ||
                                    t("dailyReport.noReasonEntered")
                                  }`
                                : t("dailyReport.unexcused")}
                            </span>
                          </td>
                          {editable && (
                            <td className="no-print px-4 py-2">
                              <button
                                type="button"
                                onClick={() => removeAbsence(absence.studentId)}
                                aria-label={t("dailyReport.removeAbsent")}
                                className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                {t("dailyReport.noAbsences")}
              </p>
            )}
          </section>
        </section>

        <section className="print-area space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-bold text-foreground">
            {t("dailyReport.dutyTitle")}
          </h2>
          {[
            ["schoolFlow", "schoolFlow"],
            ["firstBreakNotes", "firstBreak"],
            ["secondBreakNotes", "secondBreak"],
            ["notes", "notes"],
          ].map(([field, labelKey]) => (
            <label
              key={field}
              className="block text-sm font-medium text-foreground"
            >
              {t(`dailyReport.${labelKey}`)}
              <textarea
                rows={field === "notes" ? 3 : 4}
                maxLength={10000}
                value={draft[field] || ""}
                onChange={(event) => updateDraft(field, event.target.value)}
                readOnly={!editable}
                className="daily-report-edit-text mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm read-only:bg-muted"
              />
              <div className="daily-report-print-text mt-1 rounded-lg border border-input px-3 py-2 text-sm">
                {draft[field] || "—"}
              </div>
            </label>
          ))}
        </section>

        {editable && (
          <div className="no-print flex justify-end">
            <button
              type="submit"
              disabled={saving || loading || !classId || !validAbsences}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? t("dailyReport.saving") : t("dailyReport.save")}
            </button>
          </div>
        )}
        {!report && !loading && !editable && (
          <p className="no-print rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            {t("dailyReport.noReport")}
          </p>
        )}
        {loading && (
          <p className="no-print text-center text-sm text-muted-foreground">
            {t("dailyReport.loading")}
          </p>
        )}
      </form>
    </div>
  );
}
