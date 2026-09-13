import { useClassesList } from "@/hooks/useClassesList";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Search,
  Filter,
  RotateCcw,
  Download,
  Upload,
} from "lucide-react";
import { downloadTemplate } from "@/lib/csv";

export default function Classes() {
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
    clearFilters,
    classTemplate,
    hasActiveFilters,
    load,
  } = useClassesList();

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
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.grade} {c.section ? `— ${c.section}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.academicYear || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.teacherName || "—"}
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
      </div>

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
    </div>
  );
}
