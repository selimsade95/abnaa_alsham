import { useEffect, useState } from "react";
import axios from "axios";
import { getLanguage, t } from "@/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { API } from "@/lib/api";

const attendanceLabels = { present: "حاضر", absent: "غائب", early_dismissal: "انصراف مبكر", truancy: "غياب أثناء الدوام" };
const periodLabels = { first: "الفصل الأول", second: "الفصل الثاني", final: "النهائي" };
async function fetchRecords(accessCode, signal) {
  const { data } = await axios.post(`${API}/parent-access`, { accessCode }, { signal });
  return data;
}

function accessError(error) {
  const status = error.response?.status;
  if (status === 401) return "رمز الدخول غير صالح. تحقق منه أو راجع إدارة المدرسة.";
  if (status === 429) return "محاولات كثيرة. حاول مرة أخرى بعد قليل.";
  return "تعذر فتح السجل. حاول مرة أخرى.";
}

const absenceLabels = { excused: "بعذر", unexcused: "بدون عذر" };

function Records({ title, headers, rows, empty }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 text-lg font-bold">{t(title)}</h2>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-muted">
              <tr>{headers.map((label) => <th key={label} scope="col" className="p-2">{t(label)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr className="border-b last:border-0" key={index}>
                  {row.map((cell, column) => <td className="p-2" key={column}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted-foreground">{t(empty)}</p>}
    </section>
  );
}

export default function ParentAccess() {
  const [scanCode, setScanCode] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("access"));
  const [accessCode, setAccessCode] = useState("");
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scanCode) return;
    // The fragment stays out of server logs. Remove it from the address bar too.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    const controller = new AbortController();
    fetchRecords(scanCode, controller.signal).then(setRecords).catch((requestError) => {
      if (!controller.signal.aborted) setError(accessError(requestError));
    }).finally(() => {
      if (!controller.signal.aborted) setScanCode(null);
    });
    return () => controller.abort();
  }, [scanCode]);

  useEffect(() => {
    if (!records) return;
    const timer = window.setTimeout(() => setRecords(null), 10 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [records]);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      setRecords(await fetchRecords(accessCode));
      setAccessCode("");
    } catch (requestError) {
      setError(accessError(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir={getLanguage() === "ar" ? "rtl" : "ltr"} lang={getLanguage()} className="theme-canvas min-h-screen px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-accent-foreground">بوابة ولي الأمر</h1>
          <div className="flex gap-2">
            <ThemeSwitcher />
            {!records && !scanCode && <LanguageSwitcher />}
          </div>
          {records ? (
            <button type="button" onClick={() => setRecords(null)} className="rounded-lg border bg-card px-4 py-2">إغلاق السجل</button>
          ) : null}
        </header>
        {records ? (
          <>
            <div className="rounded-xl bg-card p-5">
              <h2 className="text-xl font-bold">{records.name}</h2>
              <p className="mt-1 text-muted-foreground">{[records.className, records.section].filter(Boolean).join(" · ")}</p>
            </div>
            <Records title="الدرجات المنشورة" headers={["المادة", "الدرجة", "الفترة", "السنة الدراسية"]}
              rows={records.grades.map((grade) => [grade.subjectName, grade.score, t(periodLabels[grade.period]) || grade.period, grade.academicYear])}
              empty="لا توجد درجات منشورة." />
            <Records title="الحضور" headers={["التاريخ", "الحالة", "دقائق التأخير"]}
              rows={records.attendance.map((entry) => [
                entry.date,
                [t(attendanceLabels[entry.status]), t(absenceLabels[entry.absenceReason])].filter(Boolean).join(" · ") || "—",
                entry.lateMinutes ?? "—",
              ])}
              empty="لا توجد سجلات حضور." />
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 text-lg font-bold">ملاحظات المدرسة</h2>
              {records.notes.length ? records.notes.map((note, index) => (
                <article key={index} className="border-b py-3 last:border-0">
                  <p className="whitespace-pre-wrap break-words">{note.content}</p>
                  {note.date && <time className="text-sm text-muted-foreground" dateTime={note.date}>{note.date.slice(0, 10)}</time>}
                </article>
              )) : <p className="text-sm text-muted-foreground">لا توجد ملاحظات تمت مشاركتها.</p>}
            </section>
          </>
        ) : scanCode ? (
          <p role="status">جارٍ فتح السجل…</p>
        ) : (
          <form onSubmit={submit} className="max-w-md space-y-4 rounded-xl border bg-card p-5">
            <p>أدخل رمز الدخول الخاص الموجود على بطاقة الطالب.</p>
            <label className="block font-medium">رمز البطاقة الخاص
              <input dir="ltr" required maxLength={30} type="password" autoComplete="off" value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{t(error)}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary px-4 py-3 font-bold text-white disabled:opacity-50">
              {loading ? "جارٍ فتح السجل…" : "عرض سجل الطالب"}
            </button>
            <p className="text-sm text-muted-foreground">إذا فقدت البطاقة، راجع إدارة المدرسة.</p>
          </form>
        )}
      </div>
    </main>
  );
}
