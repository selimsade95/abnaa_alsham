import { Link } from "react-router-dom";
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  Printer,
  Loader2,
  Filter,
  FileText,
  Download,
  Upload,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react";
import { STATUS_LABELS, GENDER_LABELS } from "@/lib/studentDefaults";
import { downloadTemplate } from "@/lib/csv";
import Pagination from "@/components/Pagination";
import { useStudentsList } from "@/hooks/useStudentsList";

const MultiSelectFilter = ({
  label,
  options,
  value,
  onChange,
  testid,
  emptyLabel = "الكل",
  exclusiveValue,
}) => (
  <div>
    <span className="text-xs text-gray-500 mb-1 block">{label}</span>
    <details className="group relative">
      <summary
        data-testid={testid}
        className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm marker:hidden"
      >
        <span>
          {exclusiveValue && value.includes(exclusiveValue)
            ? "الكل"
            : value.length
              ? `${value.length} محدد`
              : emptyLabel}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 max-h-64 w-full min-w-52 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
        <button
          type="button"
          onClick={() => onChange([])}
          className="mb-1 w-full rounded px-2 py-1 text-right text-xs text-[#036A87] hover:bg-gray-50"
        >
          مسح التحديد
        </button>
        {options.map(({ value: optionValue, label: optionLabel }) => (
          <label
            key={optionValue}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={value.includes(optionValue)}
              onChange={(event) =>
                onChange(
                  exclusiveValue === optionValue
                    ? event.target.checked
                      ? [optionValue]
                      : []
                    : event.target.checked
                      ? [
                          ...value.filter((item) => item !== exclusiveValue),
                          optionValue,
                        ]
                      : value.filter((item) => item !== optionValue),
                )
              }
              className="rounded border-gray-300 text-[#036A87] focus:ring-[#04CDF9]"
            />
            {optionLabel}
          </label>
        ))}
      </div>
    </details>
  </div>
);

export default function StudentsList() {
  const {
    has,
    nav,
    items,
    registrationPaths,
    summary,
    pagination,
    changePageSize,
    sortBy,
    sortOrder,
    sortStudents,
    loading,
    q,
    setQ,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    classes,
    confirmId,
    setConfirmId,
    deactivationReason,
    setDeactivationReason,
    deleting,
    reactivating,
    importProgress,
    importRef,
    load,
    doDelete,
    doReactivate,
    clearFilters,
    exportStudents,
    importStudents,
    studentTemplate,
    activeCount,
  } = useStudentsList();

  const sortableHeader = (label, field) => (
    <th
      key={field}
      className="px-4 py-3 font-medium"
      aria-sort={
        sortBy === field
          ? sortOrder === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => sortStudents(field)}
        className="inline-flex items-center gap-1 hover:text-gray-900"
        aria-label={`${label} - ${
          sortBy === field
            ? sortOrder === "asc"
              ? "ترتيب تصاعدي"
              : "ترتيب تنازلي"
            : "ترتيب"
        }`}
      >
        {label}
        {sortBy !== field ? (
          <ArrowUpDown className="h-3.5 w-3.5" />
        ) : sortOrder === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )}
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">الطلاب</h1>
          <p className="text-sm text-gray-500 mt-1">جميع الطلاب المسجلين</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {has("students.create") && (
            <Link
              to="/students/new"
              data-testid="add-student-btn"
              className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
            >
              <Plus className="h-4 w-4" /> إضافة طالب
            </Link>
          )}
          {has("students.view") && (
            <button
              onClick={exportStudents}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <Download className="h-4 w-4" /> تصدير
            </button>
          )}
          {has("students.create") && (
            <>
              <button
                onClick={() =>
                  downloadTemplate("students-template.csv", studentTemplate)
                }
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <Download className="h-4 w-4" /> قالب الاستيراد
              </button>
              <button
                disabled={!!importProgress}
                onClick={() => importRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {importProgress ? "جارٍ الاستيراد..." : "استيراد"}
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".csv,text/csv"
                onChange={importStudents}
                disabled={!!importProgress}
                className="hidden"
              />
            </>
          )}
        </div>
      </div>

      {importProgress && (
        <div
          className="rounded-lg border border-cyan-200 bg-cyan-50 p-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="student-import-progress"
        >
          <div className="mb-2 flex items-center justify-between gap-3 text-sm text-cyan-900">
            <span>
              {importProgress.stage === "uploading"
                ? "جارٍ رفع ملف الطلاب..."
                : "تم رفع الملف، جارٍ استيراد الطلاب..."}
            </span>
            {importProgress.stage === "uploading" &&
              importProgress.percent !== null && (
                <span>{importProgress.percent}%</span>
              )}
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-cyan-100"
            role="progressbar"
            aria-label="تقدم استيراد الطلاب"
            aria-valuemin={0}
            aria-valuemax={100}
            {...(importProgress.stage === "uploading" &&
            importProgress.percent !== null
              ? { "aria-valuenow": importProgress.percent }
              : {
                  "aria-valuetext":
                    importProgress.stage === "processing"
                      ? "جارٍ معالجة الملف"
                      : "جارٍ رفع الملف",
                })}
          >
            <div
              className={`h-full rounded-full bg-[#04A9CE] transition-all duration-200 ${
                importProgress.stage === "processing" ||
                importProgress.percent === null
                  ? "w-full animate-pulse"
                  : ""
              }`}
              style={
                importProgress.stage === "uploading" &&
                importProgress.percent !== null
                  ? { width: `${importProgress.percent}%` }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              data-testid="students-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم / الكود / الهاتف / العنوان..."
              className="w-full rounded-lg border border-gray-300 pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-[#04CDF9]"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            data-testid="toggle-filters-btn"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${activeCount ? "border-[#04CDF9] text-[#036A87] bg-brand-light" : "border-gray-300 text-gray-700"}`}
          >
            <Filter className="h-4 w-4" /> فلاتر{" "}
            {activeCount > 0 && (
              <span className="rounded-full bg-[#04CDF9] text-white text-[10px] px-1.5">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="p-4 border-b border-gray-200 bg-gray-50 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الجنس</label>
              <select
                value={filters.gender}
                onChange={(e) =>
                  setFilters({ ...filters, gender: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                data-testid="filter-gender"
              >
                <option value="">الكل</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">يتيم</label>
              <select
                value={filters.orphan}
                onChange={(e) =>
                  setFilters({ ...filters, orphan: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                data-testid="filter-orphan"
              >
                <option value="">الكل</option>
                <option value="true">نعم</option>
                <option value="false">لا</option>
              </select>
            </div>
            <MultiSelectFilter
              label="مسار التسجيل"
              value={filters.registrationPath}
              options={registrationPaths.map((path) => ({
                value: path,
                label: path,
              }))}
              onChange={(registrationPath) =>
                setFilters({ ...filters, registrationPath })
              }
              testid="filter-registration-path"
            />
            <MultiSelectFilter
              label="مسار التسجيل النهائي"
              value={filters.finalRegistrationPath}
              options={registrationPaths.map((path) => ({
                value: path,
                label: path,
              }))}
              onChange={(finalRegistrationPath) =>
                setFilters({ ...filters, finalRegistrationPath })
              }
              testid="filter-final-registration-path"
            />
            <MultiSelectFilter
              label="الصف"
              value={filters.classId}
              options={classes.map((classItem) => ({
                value: classItem.id,
                label: `${classItem.name} ${classItem.section ? `— ${classItem.section}` : ""}`,
              }))}
              onChange={(classId) => setFilters({ ...filters, classId })}
              testid="filter-class"
            />
            <MultiSelectFilter
              label="الوضع"
              value={filters.status}
              options={[
                { value: "all", label: "الكل" },
                ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
              onChange={(status) => setFilters({ ...filters, status })}
              testid="filter-status"
              emptyLabel="النشطون فقط"
              exclusiveValue="all"
            />
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                السنة الدراسية
              </label>
              <input
                value={filters.academicYear}
                onChange={(e) =>
                  setFilters({ ...filters, academicYear: e.target.value })
                }
                placeholder="2026-2027"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                حالة الدفع
              </label>
              <select
                value={filters.paymentStatus}
                onChange={(e) =>
                  setFilters({ ...filters, paymentStatus: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">الكل</option>
                <option value="unpaid">غير مدفوع</option>
                <option value="partial">دفع جزئي</option>
                <option value="paid">مسدَّد بالكامل</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <button
                onClick={clearFilters}
                className="text-sm text-[#036A87] hover:underline"
              >
                مسح الفلاتر
              </button>
            </div>
          </div>
        )}

        {activeCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 border-b border-gray-200">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="text-sm text-sky-700">إجمالي المستحق</div>
              <div className="mt-1 text-2xl font-bold text-sky-900">
                {summary.totalPayable.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm text-emerald-700">إجمالي المدفوع</div>
              <div className="mt-1 text-2xl font-bold text-emerald-900">
                {summary.totalPaid.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm text-amber-700">إجمالي المتبقي</div>
              <div className="mt-1 text-2xl font-bold text-amber-900">
                {summary.totalRemaining.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm text-gray-700">إجمالي رسوم الكتب</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {(summary.totalBooksFee || 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm text-gray-700">إجمالي رسوم الحافلة</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {(summary.totalBusFee || 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm text-gray-700">إجمالي رسوم الزي</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {(summary.totalOutfitFee || 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-right">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                {sortableHeader("الكود", "code")}
                {sortableHeader("الاسم الكامل", "name")}
                {sortableHeader("الجنس", "gender")}
                {sortableHeader("تاريخ الميلاد", "birthdate")}
                {sortableHeader("الصف", "class")}
                {sortableHeader("مسار", "registrationPath")}
                {sortableHeader("الوضع", "status")}
                {sortableHeader("يتيم", "orphan")}
                <th className="px-4 py-3 font-medium text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    <Loader2 className="inline h-4 w-4 animate-spin ms-2" />{" "}
                    جاري التحميل...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-gray-500"
                    data-testid="students-empty"
                  >
                    لا توجد نتائج مطابقة.{" "}
                    <button
                      onClick={clearFilters}
                      className="text-[#036A87] hover:underline"
                    >
                      مسح الفلاتر
                    </button>
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                    data-testid={`student-row-${s.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {s.code || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        to={`/students/${s.id}`}
                        className="text-[#036A87] hover:underline"
                      >
                        {s.student?.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {GENDER_LABELS[s.student?.gender] || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.student?.birthdate?.slice(0, 10) || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {has("classes.view") && s.currentClassId ? (
                        <Link
                          to={`/classes/${s.currentClassId}`}
                          className="text-[#036A87] hover:underline"
                        >
                          {s.currentClass.name}
                        </Link>
                      ) : (
                        s.currentClass?.name || s.student?.newClass || "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{s.student?.registrationPath || "—"}</div>
                      <div className="text-xs text-gray-500">
                        النهائي:{" "}
                        {s.student?.finalRegistrationPath ||
                          s.student?.registrationPath ||
                          "—"}
                      </div>
                    </td>
                    <td
                      className={`px-4 py-3 ${s.student?.status === "inactive" ? "text-red-600" : "text-gray-600"}`}
                    >
                      <div>{STATUS_LABELS[s.student?.status] || "—"}</div>
                      {s.student?.status === "inactive" &&
                        s.deactivationReason && (
                          <div
                            className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                            role="alert"
                          >
                            سبب التعطيل: {s.deactivationReason}
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      {s.student?.orphan ? (
                        <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          نعم
                        </span>
                      ) : (
                        <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                          لا
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-start">
                        <button
                          onClick={() => nav(`/students/${s.id}`)}
                          data-testid={`view-btn-${s.id}`}
                          title="عرض"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {has("students.fullInformation.view") && (
                          <button
                            onClick={() =>
                              nav(`/students/${s.id}/full-information`)
                            }
                            data-testid={`fullinfo-btn-${s.id}`}
                            title="المعلومات الكاملة"
                            className="p-1.5 rounded-md text-[#036A87] hover:bg-brand-light"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                        {has("students.update") && (
                          <button
                            onClick={() => nav(`/students/${s.id}/edit`)}
                            data-testid={`edit-btn-${s.id}`}
                            title="تعديل"
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {has("students.print") && (
                          <button
                            onClick={() =>
                              window.open(`/students/${s.id}/print`, "_blank")
                            }
                            data-testid={`print-btn-${s.id}`}
                            title="طباعة"
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        )}
                        {s.student?.status === "inactive"
                          ? has("students.update") && (
                              <button
                                onClick={() => doReactivate(s.id)}
                                disabled={reactivating === s.id}
                                data-testid={`reactivate-btn-${s.id}`}
                                title="إعادة التفعيل"
                                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )
                          : has("students.delete") && (
                              <button
                                onClick={() => {
                                  setDeactivationReason("");
                                  setConfirmId(s.id);
                                }}
                                data-testid={`delete-btn-${s.id}`}
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
          onPageSizeChange={changePageSize}
          testId="students-pagination"
        />
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              تأكيد التعطيل
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              سيبقى الطالب وبياناته محفوظين، لكنه لن يظهر في القوائم العادية.
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
              placeholder="اكتب سبب تعطيل الطالب"
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
                disabled={deleting || !deactivationReason.trim()}
                data-testid="confirm-delete-btn"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "جاري التعطيل..." : "تعطيل"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
