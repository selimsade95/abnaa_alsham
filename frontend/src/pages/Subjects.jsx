import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function Subjects() {
  const { has } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [classAssignments, setClassAssignments] = useState([]);
  const [editing, setEditing] = useState(null);
  const [teacherForm, setTeacherForm] = useState({
    teacherId: "",
    subjectId: "",
  });
  const [classForm, setClassForm] = useState({
    classId: "",
    subjectId: "",
    teacherIds: [],
  });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const requests = [
        api.get("/subjects", { params: { status: "all" } }),
        api.get("/class-subject-assignments"),
      ];
      if (has("subjects.update"))
        requests.push(
          api.get("/teachers", { params: { limit: 500 } }),
          api.get("/classes", { params: { limit: 500 } }),
          api.get("/teacher-subject-assignments"),
        );
      const [s, ca, t, c, ta] = await Promise.all(requests);
      setSubjects(s.data);
      setTeachers(t?.data.data || []);
      setClasses(c?.data.data || []);
      setTeacherAssignments(ta?.data || []);
      setClassAssignments(ca.data);
    } catch {
      toast.error("تعذر تحميل المواد والإسنادات");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(); /* eslint-disable-line react-hooks/exhaustive-deps */
  }, []);

  const saveSubject = async (event) => {
    event.preventDefault();
    try {
      if (editing.id) await api.put(`/subjects/${editing.id}`, editing);
      else await api.post("/subjects", editing);
      setEditing(null);
      toast.success("تم حفظ المادة");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل حفظ المادة");
    }
  };
  const addTeacherAssignment = async (event) => {
    event.preventDefault();
    try {
      await api.post("/teacher-subject-assignments", teacherForm);
      setTeacherForm({ teacherId: "", subjectId: "" });
      toast.success("تم إسناد المادة للمعلم");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل الإسناد");
    }
  };
  const addClassAssignment = async (event) => {
    event.preventDefault();
    try {
      await api.post("/class-subject-assignments", classForm);
      setClassForm({ classId: "", subjectId: "", teacherIds: [] });
      toast.success("تم إسناد المادة للصف");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل الإسناد");
    }
  };
  const subjectName = (id) =>
    subjects.find((item) => item.id === id)?.name || "—";
  const teacherName = (id) =>
    teachers.find((item) => item.id === id)?.fullName || "—";
  const className = (id) => classes.find((item) => item.id === id)?.name || "—";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            المواد والإسنادات
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            حدد المواد، معلميها، والمواد المتاحة لكل صف
          </p>
        </div>
        {has("subjects.create") && (
          <button
            onClick={() =>
              setEditing({ name: "", code: "", status: "active", notes: "" })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> مادة جديدة
          </button>
        )}
      </div>
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm text-right">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">المادة</th>
              <th className="px-4 py-3">الرمز</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="p-8 text-center">
                  <Loader2 className="inline h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : (
              subjects.map((subject) => (
                <tr key={subject.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{subject.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {subject.code || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {subject.status === "active" ? "نشطة" : "غير نشطة"}
                  </td>
                  <td className="px-4 py-3 text-left">
                    {has("subjects.update") && (
                      <button
                        onClick={() => setEditing(subject)}
                        className="p-1.5 text-gray-500"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}{" "}
                    {has("subjects.delete") && subject.status === "active" && (
                      <button
                        onClick={async () => {
                          await api.delete(`/subjects/${subject.id}`);
                          load();
                        }}
                        className="p-1.5 text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      {has("subjects.update") && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold mb-4">إسناد مادة لمعلم</h2>
            <form onSubmit={addTeacherAssignment} className="space-y-3">
              <select
                required
                value={teacherForm.teacherId}
                onChange={(e) =>
                  setTeacherForm({ ...teacherForm, teacherId: e.target.value })
                }
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">اختر المعلم</option>
                {teachers
                  .filter((t) => t.employmentStatus === "active")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
              </select>
              <select
                required
                value={teacherForm.subjectId}
                onChange={(e) =>
                  setTeacherForm({ ...teacherForm, subjectId: e.target.value })
                }
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">اختر المادة</option>
                {subjects
                  .filter((s) => s.status === "active")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white">
                إسناد
              </button>
            </form>
            <div className="mt-4 space-y-1 text-sm">
              {teacherAssignments.map((a) => (
                <div key={a.id} className="flex justify-between border-t pt-2">
                  <span>
                    {teacherName(a.teacherId)} · {subjectName(a.subjectId)}
                  </span>
                  <button
                    onClick={async () => {
                      await api.delete(`/teacher-subject-assignments/${a.id}`);
                      load();
                    }}
                    className="text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold mb-4">إسناد مادة لصف ومعلمين</h2>
            <form onSubmit={addClassAssignment} className="space-y-3">
              <select
                required
                value={classForm.classId}
                onChange={(e) =>
                  setClassForm({ ...classForm, classId: e.target.value })
                }
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">اختر الصف</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.section || ""}
                  </option>
                ))}
              </select>
              <select
                required
                value={classForm.subjectId}
                onChange={(e) =>
                  setClassForm({ ...classForm, subjectId: e.target.value })
                }
                className="w-full rounded-lg border px-3 py-2"
              >
                <option value="">اختر المادة</option>
                {subjects
                  .filter((s) => s.status === "active")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <select
                multiple
                required
                value={classForm.teacherIds}
                onChange={(e) =>
                  setClassForm({
                    ...classForm,
                    teacherIds: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value,
                    ),
                  })
                }
                className="w-full rounded-lg border px-3 py-2 min-h-24"
              >
                {teachers
                  .filter((t) => t.employmentStatus === "active")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
              </select>
              <button className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white">
                إسناد
              </button>
            </form>
            <div className="mt-4 space-y-1 text-sm">
              {classAssignments.map((a) => (
                <div key={a.id} className="flex justify-between border-t pt-2">
                  <span>
                    {className(a.classId)} · {subjectName(a.subjectId)} ·{" "}
                    {(a.teacherIds || []).map(teacherName).join(", ") ||
                      "بدون معلم"}
                  </span>
                  <button
                    onClick={async () => {
                      await api.delete(`/class-subject-assignments/${a.id}`);
                      load();
                    }}
                    className="text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={saveSubject}
            className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"
          >
            <h2 className="text-lg font-bold">
              {editing.id ? "تعديل مادة" : "مادة جديدة"}
            </h2>
            <input
              required
              placeholder="اسم المادة"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"
            />
            <input
              placeholder="الرمز"
              value={editing.code || ""}
              onChange={(e) => setEditing({ ...editing, code: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border px-4 py-2"
              >
                إلغاء
              </button>
              <button className="rounded-lg bg-[#04CDF9] px-4 py-2 text-white">
                حفظ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
