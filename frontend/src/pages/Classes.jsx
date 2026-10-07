import { useState } from "react";
import { Link } from "react-router-dom";
import { useClassesList } from "@/hooks/useClassesList";
import api from "@/lib/api";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Eye,
  Search,
  Filter,
  RotateCcw,
  Download,
  Upload,
  GraduationCap,
  ClipboardPlus,
  X,
} from "lucide-react";
import { downloadTemplate } from "@/lib/csv";
import { toast } from "sonner";
import Pagination from "@/components/Pagination";

export default function Classes() {
  const [classDetails, setClassDetails] = useState(null);
  const [classDetailsLoading, setClassDetailsLoading] = useState(false);
  const [classDetailsError, setClassDetailsError] = useState("");
  const [classGradesError, setClassGradesError] = useState(false);
  const [homeworkModal, setHomeworkModal] = useState(null);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [homeworkSaving, setHomeworkSaving] = useState(false);
  const [homeworkSubjectId, setHomeworkSubjectId] = useState("");
  const [undoneStudentIds, setUndoneStudentIds] = useState([]);
  const {
    has,
    items,
    teachers,
    pagination,
    loading,
    q,
    setQ,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    editing,
    setEditing,
    confirmId,
    setConfirmId,
    deactivationReason,
    setDeactivationReason,
    reactivating,
    importRef,
    exportClasses,
    importClasses,
    openNew,
    openEdit,
    save,
    doDelete,
    doReactivate,
    promotion,
    promotionLoading,
    promotionSaving,
    openPromotion,
    updatePromotion,
    updatePromotionStudent,
    submitPromotion,
    setPromotion,
    clearFilters,
    classTemplate,
    hasActiveFilters,
    load,
  } = useClassesList();

  const openHomeworkModal = async (classItem) => {
    setHomeworkModal({ classItem, students: [], subjects: [] });
    setHomeworkSubjectId("");
    setUndoneStudentIds([]);
    setHomeworkLoading(true);
    try {
      const response = await api.get(
        `/classes/${classItem.id}/homework-options`,
      );
      setHomeworkModal({ classItem, ...response.data });
      if (response.data.subjects.length === 1) {
        setHomeworkSubjectId(response.data.subjects[0].id);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر تحميل بيانات الواجب");
      setHomeworkModal(null);
    } finally {
      setHomeworkLoading(false);
    }
  };

  const saveHomework = async (event) => {
    event.preventDefault();
    if (!homeworkSubjectId || undoneStudentIds.length === 0) return;
    setHomeworkSaving(true);
    try {
      await api.post("/homework", {
        classId: homeworkModal.classItem.id,
        subjectId: homeworkSubjectId,
        studentIds: undoneStudentIds,
      });
      toast.success(`تم تسجيل الواجب لـ ${undoneStudentIds.length} طالب`);
      setHomeworkModal(null);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر حفظ الواجب");
    } finally {
      setHomeworkSaving(false);
    }
  };

  const openClassDetails = async (classItem) => {
    setClassDetails({
      classItem,
      students: [],
      average: null,
      gradeCount: 0,
    });
    setClassDetailsError("");
    setClassGradesError(false);
    setClassDetailsLoading(true);
    try {
      const response = await api.get("/students", {
        params: { classId: classItem.id, status: "all", limit: 500 },
      });
      const students = response.data.data || [];
      let average = null;
      let gradeCount = 0;
      if (has("grades.view")) {
        try {
          const gradesResponse = await api.get("/grades", {
            params: {
              classId: classItem.id,
              ...(classItem.academicYear
                ? { academicYear: classItem.academicYear }
                : {}),
            },
          });
          const scores = gradesResponse.data
            .map((grade) => Number(grade.score))
            .filter(Number.isFinite);
          gradeCount = scores.length;
          if (gradeCount)
            average =
              scores.reduce((total, score) => total + score, 0) / gradeCount;
        } catch {
          setClassGradesError(true);
        }
      }
      setClassDetails({ classItem, students, average, gradeCount });
    } catch (error) {
      setClassDetailsError(
        error?.response?.data?.detail || "تعذر تحميل طلاب الصف",
      );
    } finally {
      setClassDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">الصفوف</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة الصفوف والشعب</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {has("classes.create") && (
            <button
              onClick={openNew}
              data-testid="add-class-btn"
              className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
            >
              <Plus className="h-4 w-4" /> إضافة صف
            </button>
          )}
          {has("classes.view") && (
            <button
              onClick={exportClasses}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <Download className="h-4 w-4" /> تصدير
            </button>
          )}
          {has("classes.create") && (
            <>
              <button
                onClick={() =>
                  downloadTemplate("classes-template.csv", classTemplate)
                }
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <Download className="h-4 w-4" /> قالب الاستيراد
              </button>
              <button
                onClick={() => importRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-3 py-2 text-sm font-semibold text-white"
              >
                <Upload className="h-4 w-4" /> استيراد
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".csv,text/csv"
                onChange={importClasses}
                className="hidden"
              />
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              data-testid="classes-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم / الكود / الصف..."
              className="w-full rounded-lg border border-gray-300 pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-[#04CDF9]"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${hasActiveFilters ? "border-[#04CDF9] text-[#036A87] bg-brand-light" : "border-gray-300 text-gray-700"}`}
          >
            <Filter className="h-4 w-4" /> فلاتر
          </button>
        </div>

        {showFilters && (
          <div className="p-4 border-b border-gray-200 bg-gray-50 grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              value={filters.grade}
              onChange={(e) =>
                setFilters({ ...filters, grade: e.target.value })
              }
              placeholder="الصف"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={filters.section}
              onChange={(e) =>
                setFilters({ ...filters, section: e.target.value })
              }
              placeholder="الشعبة"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={filters.academicYear}
              onChange={(e) =>
                setFilters({ ...filters, academicYear: e.target.value })
              }
              placeholder="السنة"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={filters.teacherId}
              onChange={(e) =>
                setFilters({ ...filters, teacherId: e.target.value })
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">كل المعلمين</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">النشطون فقط</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
              <option value="all">الكل</option>
            </select>
            <div className="md:col-span-5">
              <button
                onClick={clearFilters}
                className="text-sm text-[#036A87] hover:underline"
              >
                مسح الفلاتر
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-right">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">الصف - الشعبة</th>
                <th className="px-4 py-3 font-medium">السنة</th>
                <th className="px-4 py-3 font-medium">المعلم</th>
                <th className="px-4 py-3 font-medium">الطلاب</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    <Loader2 className="inline h-4 w-4 animate-spin ms-2" />{" "}
                    جاري التحميل...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    لا توجد نتائج.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                    data-testid={`class-row-${c.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {c.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        to={`/classes/${c.id}`}
                        className="text-[#036A87] hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.grade} {c.section ? `— ${c.section}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.academicYear || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {has("teachers.view") && (c.teacherIds || []).length > 0 ? (
                        <div className="flex flex-wrap gap-x-2">
                          {(c.teacherIds || []).map((teacherId, index) => (
                            <Link
                              key={teacherId}
                              to={`/teachers/${teacherId}`}
                              className="text-[#036A87] hover:underline"
                            >
                              {c.teacherNames?.[index] || c.teacherName}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        c.teacherName || "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">
                      {c.studentCount || 0}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${c.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}
                      >
                        {c.status === "active" ? "نشط" : "غير نشط"}
                      </span>
                      {c.status === "inactive" && c.deactivationReason && (
                        <div
                          className="mt-1 max-w-xs rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                          role="alert"
                        >
                          سبب التعطيل: {c.deactivationReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <div className="inline-flex gap-1">
                        {c.status === "active" && has("homework.create") && (
                          <button
                            onClick={() => openHomeworkModal(c)}
                            data-testid={`add-homework-${c.id}`}
                            title="إضافة واجب"
                            aria-label={`إضافة واجب لصف ${c.name}`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[#036A87] hover:bg-brand-light"
                          >
                            <ClipboardPlus className="h-4 w-4" />
                            إضافة واجب
                          </button>
                        )}
                        {has("students.view") && (
                          <button
                            onClick={() => openClassDetails(c)}
                            data-testid={`class-details-${c.id}`}
                            title="معلومات الصف والطلاب"
                            className="p-1.5 rounded-md text-[#036A87] hover:bg-brand-light"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {c.status === "active" && has("students.update") && (
                          <button
                            onClick={() => openPromotion(c)}
                            data-testid={`promote-class-${c.id}`}
                            title="ترفيع الطلاب"
                            className="p-1.5 rounded-md text-[#036A87] hover:bg-brand-light"
                          >
                            <GraduationCap className="h-4 w-4" />
                          </button>
                        )}
                        {has("classes.update") && (
                          <button
                            onClick={() => openEdit(c)}
                            data-testid={`edit-class-${c.id}`}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {c.status === "inactive"
                          ? has("classes.update") && (
                              <button
                                onClick={() => doReactivate(c.id)}
                                disabled={reactivating === c.id}
                                data-testid={`reactivate-class-${c.id}`}
                                title="إعادة التفعيل"
                                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )
                          : has("classes.delete") && (
                              <button
                                onClick={() => {
                                  setDeactivationReason("");
                                  setConfirmId(c.id);
                                }}
                                data-testid={`deactivate-class-${c.id}`}
                                title="تعطيل"
                                className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          pagination={pagination}
          onPageChange={load}
          testId="classes-pagination"
        />
      </div>

      {promotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-5">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  ترفيع طلاب {promotion.sourceClass.name}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  اختر الصف التالي والطلاب المراد نقلهم، ثم حدد المستحق الدراسي الجديد لكل طالب.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromotion(null)}
                title="إغلاق"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  الصف الجديد
                </label>
                <select
                  value={promotion.destinationClassId}
                  onChange={(event) =>
                    updatePromotion({ destinationClassId: event.target.value })
                  }
                  className="w-full max-w-xl rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  data-testid="promotion-destination-class"
                >
                  <option value="">اختر الصف التالي</option>
                  {promotion.destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.name}
                      {destination.section ? ` — ${destination.section}` : ""}
                      {destination.academicYear ? ` — ${destination.academicYear}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {promotionLoading ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  <Loader2 className="ms-2 inline h-4 w-4 animate-spin" /> جاري تحميل الطلاب...
                </div>
              ) : promotion.students.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  لا يوجد طلاب في هذا الصف.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-sm text-right">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="تحديد كل الطلاب"
                            checked={promotion.students.every((student) => student.selected)}
                            onChange={(event) =>
                              updatePromotion({
                                students: promotion.students.map((student) => ({
                                  ...student,
                                  selected: event.target.checked,
                                })),
                              })
                            }
                            className="h-4 w-4 accent-[#04CDF9]"
                          />
                        </th>
                        <th className="px-3 py-2">الطالب</th>
                        <th className="px-3 py-2">المستحق الحالي</th>
                        <th className="px-3 py-2">المستحق الجديد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotion.students.map((student) => (
                        <tr key={student.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={student.selected}
                              onChange={(event) =>
                                updatePromotionStudent(student.id, {
                                  selected: event.target.checked,
                                })
                              }
                              aria-label={`تحديد ${student.student?.fullName}`}
                              data-testid={`promotion-student-${student.id}`}
                              className="h-4 w-4 accent-[#04CDF9]"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{student.student?.fullName}</div>
                            <div className="text-xs text-gray-500">{student.code}</div>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-gray-600">
                            {Number(student.fees?.totalPayable || 0).toLocaleString("ar-EG")}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={!student.selected}
                              value={student.newTotalPayable}
                              onChange={(event) =>
                                updatePromotionStudent(student.id, {
                                  newTotalPayable: event.target.value,
                                })
                              }
                              data-testid={`promotion-payable-${student.id}`}
                              aria-label={`المستحق الجديد لـ ${student.student?.fullName}`}
                              className="w-36 rounded-lg border border-gray-300 px-2 py-1.5 tabular-nums disabled:bg-gray-50"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-5">
              <span className="text-sm text-gray-500">
                المحدد: {promotion.students.filter((student) => student.selected).length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPromotion(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={submitPromotion}
                  disabled={promotionSaving || promotion.students.every((student) => !student.selected)}
                  data-testid="submit-promotion"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#036A87] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {promotionSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  ترفيع المحددين
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 my-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editing.id ? "تعديل صف" : "إضافة صف"}
            </h3>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    اسم الصف *
                  </label>
                  <input
                    required
                    data-testid="class-name"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    placeholder="مثال: الصف الأول"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الصف
                  </label>
                  <input
                    value={editing.grade}
                    onChange={(e) =>
                      setEditing({ ...editing, grade: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الشعبة
                  </label>
                  <input
                    value={editing.section}
                    onChange={(e) =>
                      setEditing({ ...editing, section: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    السنة الدراسية
                  </label>
                  <input
                    value={editing.academicYear}
                    onChange={(e) =>
                      setEditing({ ...editing, academicYear: e.target.value })
                    }
                    placeholder="2026-2027"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المعلم
                  </label>
                  <select
                    value={editing.teacherIds || []}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        teacherIds: Array.from(
                          e.target.selectedOptions,
                          (option) => option.value,
                        ),
                      })
                    }
                    multiple
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-24"
                  >
                    {teachers
                      .filter((t) => t.employmentStatus === "active")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    السعة
                  </label>
                  <input
                    type="number"
                    value={editing.capacity}
                    onChange={(e) =>
                      setEditing({ ...editing, capacity: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الحالة
                  </label>
                  <select
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="active">نشط</option>
                    <option value="inactive">غير نشط</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ملاحظات
                  </label>
                  <textarea
                    rows={2}
                    value={editing.notes}
                    onChange={(e) =>
                      setEditing({ ...editing, notes: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  data-testid="save-class-btn"
                  className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              تأكيد التعطيل
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              سيبقى الصف وبياناته محفوظين، لكنه لن يظهر في القوائم العادية.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              سبب التعطيل <span className="text-red-500">*</span>
            </label>
            <textarea
              value={deactivationReason}
              onChange={(e) => setDeactivationReason(e.target.value)}
              required
              rows={3}
              data-testid="deactivation-reason-input"
              placeholder="اكتب سبب تعطيل الصف"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-6"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setConfirmId(null);
                  setDeactivationReason("");
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={doDelete}
                disabled={!deactivationReason.trim()}
                data-testid="confirm-class-delete-btn"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                تعطيل
              </button>
            </div>
          </div>
        </div>
      )}
      {classDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-5">
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
            dir="rtl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {classDetails.classItem.name}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {[classDetails.classItem.grade, classDetails.classItem.section]
                    .filter(Boolean)
                    .join(" — ")}
                  {classDetails.classItem.academicYear
                    ? ` • ${classDetails.classItem.academicYear}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClassDetails(null)}
                title="إغلاق"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm text-gray-500">عدد الطلاب</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">
                    {classDetailsLoading
                      ? "…"
                      : classDetails.students.length}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm text-gray-500">
                    متوسط درجات الصف
                  </div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">
                    {classDetailsLoading
                      ? "…"
                      : classDetails.average === null
                        ? "—"
                        : `${classDetails.average.toFixed(1)}%`}
                  </div>
                  {classDetails.gradeCount > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      {classDetails.gradeCount} درجة مسجلة
                    </div>
                  )}
                  {!has("grades.view") && (
                    <div className="mt-1 text-xs text-gray-500">
                      لا توجد صلاحية لعرض الدرجات
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-sm text-gray-500">المعلمون</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {has("teachers.view") &&
                    classDetails.classItem.teacherIds?.length ? (
                      <div className="flex flex-wrap gap-x-2">
                        {classDetails.classItem.teacherIds.map(
                          (teacherId, index) => (
                            <Link
                              key={teacherId}
                              to={`/teachers/${teacherId}`}
                              onClick={() => setClassDetails(null)}
                              className="text-[#036A87] hover:underline"
                            >
                              {classDetails.classItem.teacherNames?.[index] ||
                                classDetails.classItem.teacherName}
                            </Link>
                          ),
                        )}
                      </div>
                    ) : (
                      classDetails.classItem.teacherName || "—"
                    )}
                  </div>
                </div>
              </div>

              {classGradesError && (
                <p className="text-sm text-amber-700" role="status">
                  تعذر تحميل الدرجات؛ متوسط الصف غير متاح حالياً.
                </p>
              )}
              {classDetailsError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {classDetailsError}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-right text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-3">كود الطالب</th>
                        <th className="px-4 py-3">اسم الطالب</th>
                        <th className="px-4 py-3">الجنس</th>
                        <th className="px-4 py-3">رقم الحافلة</th>
                        <th className="px-4 py-3">الهاتف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classDetailsLoading ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-gray-500"
                          >
                            <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                            جاري تحميل الطلاب...
                          </td>
                        </tr>
                      ) : classDetails.students.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-8 text-center text-gray-500"
                          >
                            لا يوجد طلاب مسجلون في هذا الصف.
                          </td>
                        </tr>
                      ) : (
                        classDetails.students.map((student) => (
                          <tr
                            key={student.id}
                            className="border-t border-gray-100"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-gray-600">
                              {student.code || "—"}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              <Link
                                to={`/students/${student.id}`}
                                onClick={() => setClassDetails(null)}
                                className="text-[#036A87] hover:underline"
                              >
                                {student.student?.fullName || "—"}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {student.student?.gender === "female"
                                ? "أنثى"
                                : student.student?.gender === "male"
                                  ? "ذكر"
                                  : "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {student.student?.busNumber || "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {student.father?.phone ||
                                student.mother?.phone ||
                                "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {homeworkModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3 sm:p-5">
          <form
            onSubmit={saveHomework}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
            dir="rtl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  إضافة واجب — {homeworkModal.classItem.name}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  حدد المادة والطلاب الذين لم يؤدوا الواجب.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHomeworkModal(null)}
                disabled={homeworkSaving}
                title="إغلاق"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto p-5">
              {homeworkLoading ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                  جاري تحميل الصف والمواد...
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="homework-subject"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      المادة
                    </label>
                    <select
                      id="homework-subject"
                      value={homeworkSubjectId}
                      onChange={(event) =>
                        setHomeworkSubjectId(event.target.value)
                      }
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">اختر المادة</option>
                      {homeworkModal.subjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))}
                    </select>
                    {homeworkModal.subjects.length === 0 && (
                      <p className="mt-2 text-sm text-amber-700">
                        لا توجد مواد مسندة إليك في هذا الصف.
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-800">
                          الطلاب الذين لم يؤدوا الواجب
                        </h3>
                        <p className="text-xs text-gray-500">
                          المحدد: {undoneStudentIds.length}
                        </p>
                      </div>
                      {homeworkModal.students.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setUndoneStudentIds((selected) =>
                              selected.length === homeworkModal.students.length
                                ? []
                                : homeworkModal.students.map(
                                    (student) => student.id,
                                  ),
                            )
                          }
                          className="text-xs font-medium text-[#036A87] hover:underline"
                        >
                          {undoneStudentIds.length ===
                          homeworkModal.students.length
                            ? "إلغاء تحديد الكل"
                            : "تحديد الكل"}
                        </button>
                      )}
                    </div>
                    {homeworkModal.students.length === 0 ? (
                      <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
                        لا يوجد طلاب نشطون في هذا الصف.
                      </p>
                    ) : (
                      <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                        {homeworkModal.students.map((student) => {
                          const checked = undoneStudentIds.includes(
                            student.id,
                          );
                          return (
                            <label
                              key={student.id}
                              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${
                                checked
                                  ? "border-amber-300 bg-amber-50"
                                  : "border-gray-200 bg-white hover:bg-gray-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setUndoneStudentIds((selected) =>
                                    checked
                                      ? selected.filter(
                                          (id) => id !== student.id,
                                        )
                                      : [...selected, student.id],
                                  )
                                }
                                className="h-4 w-4 accent-[#04CDF9]"
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-gray-900">
                                  {student.student?.fullName || "—"}
                                </span>
                                {student.code && (
                                  <span className="block font-mono text-xs text-gray-500">
                                    {student.code}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4">
              <button
                type="button"
                onClick={() => setHomeworkModal(null)}
                disabled={homeworkSaving}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={
                  homeworkLoading ||
                  homeworkSaving ||
                  !homeworkSubjectId ||
                  undoneStudentIds.length === 0
                }
                className="inline-flex items-center gap-2 rounded-lg bg-[#036A87] px-4 py-2 text-sm font-semibold text-white hover:bg-[#02566E] disabled:opacity-50"
              >
                {homeworkSaving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                حفظ الواجب
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
