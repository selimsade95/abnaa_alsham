import { useEffect, useState } from "react";
import api from "@/lib/api";

export function useGrades(params = {}, enabled = true) {
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
        api.get("/classes"),
        api.get("/class-subject-assignments"),
        api.get("/subjects"),
        api
          .get("/settings/grades")
          .catch(() => ({ data: { accepting: false } })),
      ]);
      setClasses(c.data.data || []);
      setAssignments(a.data);
      setSubjects(s.data);
      setAccepting(!!settings.data.accepting);
    } catch {
      toast.error("تعذر تحميل إعدادات الدرجات");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadBase();
  }, []);

  const classAssignments = assignments.filter(
    (a) => a.classId === selectedClass,
  );
  const availableSubjects = classAssignments
    .map((a) => subjects.find((s) => s.id === a.subjectId))
    .filter(Boolean);
  const activeAssignment = classAssignments.find(
    (a) => a.subjectId === selectedSubject,
  );

  useEffect(() => {
    const params = {
      classId: selectedClass || undefined,
      subjectId: selectedSubject || undefined,
      period,
      academicYear: academicYear || undefined,
    };
    const gradeRequest = api.get("/grades", { params });
    const studentRequest = selectedClass
      ? api.get("/students", { params: { classId: selectedClass, limit: 500 } })
      : Promise.resolve({ data: { data: [] } });
    Promise.all([studentRequest, gradeRequest])
      .then(([studentResponse, gradeResponse]) => {
        const nextGrades = gradeResponse.data;
        setStudents(studentResponse.data.data || []);
        setGrades(selectedClass && selectedSubject ? nextGrades : []);
        setOverviewGrades(nextGrades);
        setScores(
          Object.fromEntries(nextGrades.map((g) => [g.studentId, g.score])),
        );
      })
      .catch(() => toast.error("تعذر تحميل الطلاب والدرجات"));
  }, [selectedClass, selectedSubject, period, academicYear]);

  const save = async (student) => {
    const score = Number(scores[student.id]);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      toast.error("أدخل درجة بين 0 و100");
      return;
    }
    const existing = grades.find((g) => g.studentId === student.id);
    const body = {
      studentId: student.id,
      classId: selectedClass,
      subjectId: selectedSubject,
      academicYear: academicYear || "current",
      period,
      score,
      notes: "",
    };
    try {
      if (existing) await api.put(`/grades/${existing.id}`, body);
      else await api.post("/grades", body);
      toast.success("تم حفظ الدرجة");
      const refreshed = await api.get("/grades", {
        params: {
          classId: selectedClass,
          subjectId: selectedSubject,
          period,
          academicYear: academicYear || undefined,
        },
      });
      setGrades(refreshed.data);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل حفظ الدرجة");
    }
  };
  const toggleAcceptance = async () => {
    try {
      const response = await api.put("/settings/grades", {
        accepting: !accepting,
      });
      setAccepting(response.data.accepting);
      toast.success(
        response.data.accepting ? "بدأ قبول الدرجات" : "تم إيقاف قبول الدرجات",
      );
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل تحديث فترة القبول");
    }
  };
  const average = useMemo(() => {
    const values = grades.map((g) => Number(g.score)).filter(Number.isFinite);
    return values.length
      ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
      : "—";
  }, [grades]);
  const filteredOverview = overviewGrades.filter(
    (grade) =>
      !studentFilter.trim() ||
      grade.studentName
        ?.toLowerCase()
        .includes(studentFilter.trim().toLowerCase()),
  );
  const highest = filteredOverview.length
    ? Math.max(...filteredOverview.map((grade) => Number(grade.score)))
    : "—";
  const lowest = filteredOverview.length
    ? Math.min(...filteredOverview.map((grade) => Number(grade.score)))
    : "—";

  return {
    classes,
    setClasses,
    assignments,
    setAssignments,
    subjects,
    setSubjects,
    students,
    setStudents,
    grades,
    setGrades,
    overviewGrades,
    setOverviewGrades,
    studentFilter,
    setStudentFilter,
    selectedClass,
    setSelectedClass,
    selectedSubject,
    setSelectedSubject,
    period,
    setPeriod,
    academicYear,
    setAcademicYear,
    scores,
    setScores,
    accepting,
    setAccepting,
    loading,
    setLoading,
    loadBase,
    classAssignments,
    availableSubjects,
    activeAssignment,
    save,
    toggleAcceptance,
    average,
    filteredOverview,
    highest,
    lowest,
  };
}
