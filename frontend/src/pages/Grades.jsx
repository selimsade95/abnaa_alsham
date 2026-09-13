import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function Grades() {
  const { has } = useAuth();
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState([]);
  const [overviewGrades, setOverviewGrades] = useState([]);
  const [studentFilter, setStudentFilter] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [period, setPeriod] = useState("first");
  const [academicYear, setAcademicYear] = useState("");
  const [scores, setScores] = useState({});
  const [accepting, setAccepting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadBase = async () => {
    try {
      const [c, a, s, settings] = await Promise.all([
        api.get("/classes"), api.get("/class-subject-assignments"),
        api.get("/subjects"), api.get("/settings/grades").catch(() => ({ data: { accepting: false } })),
      ]);
      setClasses(c.data.data || []); setAssignments(a.data); setSubjects(s.data); setAccepting(!!settings.data.accepting);
    } catch { toast.error("تعذر تحميل إعدادات الدرجات"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadBase(); }, []);

  const classAssignments = assignments.filter((a) => a.classId === selectedClass);
  const availableSubjects = classAssignments.map((a) => subjects.find((s) => s.id === a.subjectId)).filter(Boolean);
  const activeAssignment = classAssignments.find((a) => a.subjectId === selectedSubject);

  useEffect(() => {
    if (!selectedClass || !selectedSubject) { setStudents([]); setGrades([]); return; }
    Promise.all([
      api.get("/students", { params: { classId: selectedClass, limit: 500 } }),
      api.get("/grades", { params: { classId: selectedClass, subjectId: selectedSubject, period, academicYear: academicYear || undefined } }),
    ]).then(([studentResponse, gradeResponse]) => {
      setStudents(studentResponse.data.data || []); setGrades(gradeResponse.data);
      setScores(Object.fromEntries(gradeResponse.data.map((g) => [g.studentId, g.score])));
    }).catch(() => toast.error("تعذر تحميل الطلاب والدرجات"));
  }, [selectedClass, selectedSubject, period, academicYear]);

  useEffect(() => {
    api.get("/grades", { params: { classId: selectedClass || undefined, subjectId: selectedSubject || undefined, period, academicYear: academicYear || undefined } })
      .then((response) => setOverviewGrades(response.data))
      .catch(() => {});
  }, [selectedClass, selectedSubject, period, academicYear]);

  const save = async (student) => {
    const score = Number(scores[student.id]);
    if (!Number.isFinite(score) || score < 0 || score > 100) { toast.error("أدخل درجة بين 0 و100"); return; }
    const existing = grades.find((g) => g.studentId === student.id);
    const body = { studentId: student.id, classId: selectedClass, subjectId: selectedSubject, academicYear: academicYear || "current", period, score, notes: "" };
    try {
      if (existing) await api.put(`/grades/${existing.id}`, body);
      else await api.post("/grades", body);
      toast.success("تم حفظ الدرجة");
      const refreshed = await api.get("/grades", { params: { classId: selectedClass, subjectId: selectedSubject, period, academicYear: academicYear || undefined } });
      setGrades(refreshed.data);
    } catch (error) { toast.error(error?.response?.data?.detail || "فشل حفظ الدرجة"); }
  };
  const toggleAcceptance = async () => {
    try { const response = await api.put("/settings/grades", { accepting: !accepting }); setAccepting(response.data.accepting); toast.success(response.data.accepting ? "بدأ قبول الدرجات" : "تم إيقاف قبول الدرجات"); }
    catch (error) { toast.error(error?.response?.data?.detail || "فشل تحديث فترة القبول"); }
  };
  const average = useMemo(() => { const values = grades.map((g) => Number(g.score)).filter(Number.isFinite); return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "—"; }, [grades]);
  const filteredOverview = overviewGrades.filter((grade) => !studentFilter.trim() || grade.studentName?.toLowerCase().includes(studentFilter.trim().toLowerCase()));
  const highest = filteredOverview.length ? Math.max(...filteredOverview.map((grade) => Number(grade.score))) : "—";
  const lowest = filteredOverview.length ? Math.min(...filteredOverview.map((grade) => Number(grade.score))) : "—";

  if (loading) return <div className="py-16 text-center text-gray-500"><Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...</div>;
  return <div className="space-y-6">
    <div className="flex items-end justify-between flex-wrap gap-4"><div><h1 className="text-3xl font-bold text-gray-900">الدرجات</h1><p className="text-sm text-gray-500 mt-1">إدخال ومراجعة درجات الطلاب حسب الصف والمادة</p></div>{has("grades.accept") && <button onClick={toggleAcceptance} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${accepting ? "bg-emerald-600" : "bg-gray-700"}`}>{accepting ? "قبول الدرجات مفتوح" : "فتح قبول الدرجات"}</button>}</div>
    {!accepting && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">فترة قبول الدرجات مغلقة. يمكن للمستخدمين ذوي صلاحية القبول فتحها.</div>}
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"><div className="grid grid-cols-1 md:grid-cols-4 gap-3"><select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedSubject(""); }} className="rounded-lg border px-3 py-2"><option value="">اختر الصف</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section || ""}</option>)}</select><select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} disabled={!selectedClass} className="rounded-lg border px-3 py-2"><option value="">اختر المادة</option>{availableSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border px-3 py-2"><option value="first">الفصل الأول</option><option value="second">الفصل الثاني</option><option value="final">النهائي</option></select><input placeholder="السنة الدراسية" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="rounded-lg border px-3 py-2" /></div>{activeAssignment && <p className="text-xs text-gray-500 mt-3">المعلمون المخولون: {activeAssignment.teacherIds?.length || 0}</p>}</section>
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto"><div className="p-4 border-b flex flex-wrap gap-4 items-center"><input placeholder="بحث باسم الطالب" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" /><span className="text-sm">عدد الدرجات: {filteredOverview.length}</span><span className="text-sm">الأعلى: {highest}</span><span className="text-sm">الأدنى: {lowest}</span></div><table className="min-w-full text-sm text-right"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3">الطالب</th><th className="px-4 py-3">الصف</th><th className="px-4 py-3">المادة</th><th className="px-4 py-3">الدرجة</th></tr></thead><tbody>{filteredOverview.map((grade) => <tr key={grade.id} className="border-t border-gray-100"><td className="px-4 py-3 font-medium">{grade.studentName}</td><td className="px-4 py-3">{grade.className}</td><td className="px-4 py-3">{grade.subjectName}</td><td className="px-4 py-3">{grade.score}</td></tr>)}</tbody></table>{filteredOverview.length === 0 && <div className="p-8 text-center text-gray-500">لا توجد درجات مطابقة للفلاتر.</div>}</section>
    {selectedClass && selectedSubject && <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto"><div className="p-4 border-b flex gap-6 text-sm"><span>درجات المادة: {grades.length}</span><span>المتوسط: {average}</span></div><table className="min-w-full text-sm text-right"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3">الطالب</th><th className="px-4 py-3">الدرجة</th><th className="px-4 py-3 text-left">حفظ</th></tr></thead><tbody>{students.map((student) => <tr key={student.id} className="border-t border-gray-100"><td className="px-4 py-3 font-medium">{student.student?.fullName || student.code}</td><td className="px-4 py-3"><input type="number" min="0" max="100" value={scores[student.id] ?? ""} onChange={(e) => setScores({ ...scores, [student.id]: e.target.value })} disabled={!accepting || (!has("grades.create") && !has("grades.edit"))} className="w-28 rounded-lg border px-3 py-2" /></td><td className="px-4 py-3 text-left"><button onClick={() => save(student)} disabled={!accepting || (!has("grades.create") && !has("grades.edit"))} className="inline-flex items-center gap-1 rounded-lg bg-[#04CDF9] px-3 py-2 text-white disabled:opacity-40"><Save className="h-4 w-4" /> حفظ</button></td></tr>)}</tbody></table>{students.length === 0 && <div className="p-8 text-center text-gray-500">لا يوجد طلاب في هذا الصف.</div>}</section>}
  </div>;
}
