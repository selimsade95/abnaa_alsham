import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ClassView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { has } = useAuth();
  const canViewStudents = has("students.view");
  const canViewTeachers = has("teachers.view");
  const [classItem, setClassItem] = useState(null);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get(`/classes/${id}`),
      canViewStudents
        ? api.get("/students", {
            params: { classId: id, status: "all", limit: 500 },
          })
        : Promise.resolve({ data: { data: [] } }),
    ])
      .then(([classResponse, studentsResponse]) => {
        if (cancelled) return;
        setClassItem(classResponse.data);
        setStudents(studentsResponse.data.data || []);
      })
      .catch((error) => {
        if (!cancelled)
          toast.error(
            error?.response?.data?.detail || "تعذر تحميل بيانات الصف",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [canViewStudents, id]);

  if (!classItem)
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
        جاري التحميل...
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </button>
        <h1 className="text-3xl font-bold text-foreground">{classItem.name}</h1>
      </div>
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ["code", "الكود"],
            ["grade", "الصف"],
            ["section", "الشعبة"],
            ["academicYear", "السنة الدراسية"],
            ["registrationDate", "تاريخ التسجيل"],
            ["teacherName", "المعلم"],
            ["capacity", "السعة"],
            ["status", "الحالة"],
            ["notes", "ملاحظات"],
          ].map(([key, label]) => (
            <div key={key}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm font-medium text-foreground">
                {key === "status"
                  ? classItem[key] === "active"
                    ? "نشط"
                    : "غير نشط"
                  : key === "registrationDate"
                    ? (classItem.reactivatedAt || classItem.createdAt)?.slice(
                        0,
                        10,
                      ) || "—"
                  : classItem[key] || "—"}
              </dd>
            </div>
          ))}
        </dl>
        {canViewTeachers && (classItem.teacherIds || []).length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">المعلمون</h2>
            <div className="flex flex-wrap gap-3">
              {(classItem.teacherNames || []).map((name, index) => (
                <Link
                  key={classItem.teacherIds[index] || name}
                  to={`/teachers/${classItem.teacherIds[index]}`}
                  className="text-sm text-accent-foreground hover:underline"
                >
                  {name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
      {canViewStudents && (
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <h2 className="border-b border-border px-5 py-4 text-lg font-semibold text-foreground">
            الطلاب ({students.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">الكود</th>
                  <th className="px-4 py-3">الاسم</th>
                  <th className="px-4 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {student.code || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/students/${student.id}`}
                        className="font-medium text-accent-foreground hover:underline"
                      >
                        {student.student?.fullName || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {student.student?.status === "inactive"
                        ? "غير نشط"
                        : "نشط"}
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      لا يوجد طلاب في هذا الصف.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
