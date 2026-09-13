import { Loader2, Save } from "lucide-react";
import { useGrades } from "@/hooks/useGrades";
import { useAuth } from "@/lib/auth";

export default function Grades() {
  const { has } = useAuth();
  const {
    classes,
    students,
    grades,
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
    loading,
    availableSubjects,
    activeAssignment,
    save,
    toggleAcceptance,
    average,
    filteredOverview,
    highest,
    lowest,
  } = useGrades();

  if (loading)
    return (
      <div className="py-16 text-center text-gray-500">
        <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">الدرجات</h1>
          <p className="text-sm text-gray-500 mt-1">
            إدخال ومراجعة درجات الطلاب حسب الصف والمادة
          </p>
        </div>
        {has("grades.accept") && (
          <button
            onClick={toggleAcceptance}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${accepting ? "bg-emerald-600" : "bg-gray-700"}`}
          >
            {accepting ? "قبول الدرجات مفتوح" : "فتح قبول الدرجات"}
          </button>
        )}
      </div>
      {!accepting && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          فترة قبول الدرجات مغلقة. يمكن للمستخدمين ذوي صلاحية القبول فتحها.
        </div>
      )}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setSelectedSubject("");
            }}
            className="rounded-lg border px-3 py-2"
          >
            <option value="">اختر الصف</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.section || ""}
              </option>
            ))}
          </select>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            disabled={!selectedClass}
            className="rounded-lg border px-3 py-2"
          >
            <option value="">اختر المادة</option>
            {availableSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border px-3 py-2"
          >
            <option value="first">الفصل الأول</option>
            <option value="second">الفصل الثاني</option>
            <option value="final">النهائي</option>
          </select>
          <input
            placeholder="السنة الدراسية"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="rounded-lg border px-3 py-2"
          />
        </div>
        {activeAssignment && (
          <p className="text-xs text-gray-500 mt-3">
            المعلمون المخولون: {activeAssignment.teacherIds?.length || 0}
          </p>
        )}
      </section>
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <div className="p-4 border-b flex flex-wrap gap-4 items-center">
          <input
            placeholder="بحث باسم الطالب"
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <span className="text-sm">
            عدد الدرجات: {filteredOverview.length}
          </span>
          <span className="text-sm">الأعلى: {highest}</span>
          <span className="text-sm">الأدنى: {lowest}</span>
        </div>
        <table className="min-w-full text-sm text-right">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">الطالب</th>
              <th className="px-4 py-3">الصف</th>
              <th className="px-4 py-3">المادة</th>
              <th className="px-4 py-3">الدرجة</th>
            </tr>
          </thead>
          <tbody>
            {filteredOverview.map((grade) => (
              <tr key={grade.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{grade.studentName}</td>
                <td className="px-4 py-3">{grade.className}</td>
                <td className="px-4 py-3">{grade.subjectName}</td>
                <td className="px-4 py-3">{grade.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOverview.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            لا توجد درجات مطابقة للفلاتر.
          </div>
        )}
      </section>
      {selectedClass && selectedSubject && (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <div className="p-4 border-b flex gap-6 text-sm">
            <span>درجات المادة: {grades.length}</span>
            <span>المتوسط: {average}</span>
          </div>
          <table className="min-w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3">الطالب</th>
                <th className="px-4 py-3">الدرجة</th>
                <th className="px-4 py-3 text-left">حفظ</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">
                    {student.student?.fullName || student.code}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={scores[student.id] ?? ""}
                      onChange={(e) =>
                        setScores({ ...scores, [student.id]: e.target.value })
                      }
                      disabled={
                        !accepting ||
                        (!has("grades.create") && !has("grades.edit"))
                      }
                      className="w-28 rounded-lg border px-3 py-2"
                    />
                  </td>
                  <td className="px-4 py-3 text-left">
                    <button
                      onClick={() => save(student)}
                      disabled={
                        !accepting ||
                        (!has("grades.create") && !has("grades.edit"))
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-[#04CDF9] px-3 py-2 text-white disabled:opacity-40"
                    >
                      <Save className="h-4 w-4" /> حفظ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              لا يوجد طلاب في هذا الصف.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
