import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
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
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { GENDER_LABELS } from "@/lib/studentDefaults";
import { downloadCsv, downloadTemplate, uploadCsv } from "@/lib/csv";

export default function Teachers() {
  const { has } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    gender: "",
    employmentStatus: "",
    specialization: "",
  });
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [reactivating, setReactivating] = useState(null);
  const importRef = useRef(null);
  const teacherColumns = [
    { label: "الكود", value: (t) => t.code },
    { label: "الاسم", value: (t) => t.fullName },
    { label: "الجنس", value: (t) => t.gender },
    { label: "الهاتف", value: (t) => t.phone },
    { label: "التخصص", value: (t) => t.specialization },
    { label: "الحالة", value: (t) => t.employmentStatus },
    { label: "سبب التعطيل", value: (t) => t.deactivationReason },
  ];
  const teacherTemplate = [
    "fullName",
    "gender [male|female]",
    "phone",
    "address",
    "specialization",
    "qualification",
    "employmentStatus [active|inactive]",
    "notes",
  ];

  const exportTeachers = async () => {
    try {
      const params = { page: 1, limit: 5000, search: debQ, ...filters };
      Object.keys(params).forEach((key) => !params[key] && delete params[key]);
      const response = await api.get("/teachers", { params });
      downloadCsv("teachers.csv", teacherColumns, response.data.data);
    } catch {
      toast.error("تعذر تصدير المعلمين");
    }
  };
  const importTeachers = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const response = await uploadCsv(api, "/teachers/import", file);
      toast.success(`تم استيراد ${response.data.created} معلم`);
      load(1);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر استيراد المعلمين");
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (debQ) params.search = debQ;
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const r = await api.get("/teachers", { params });
      setItems(r.data.data);
      setPagination(r.data.pagination);
    } catch {
      toast.error("تعذر التحميل");
    }
    setLoading(false);
  };
  useEffect(() => {
    load(1); /* eslint-disable-next-line */
  }, [debQ, filters]);

  const doDelete = async () => {
    if (!confirmId || !deactivationReason.trim()) return;
    try {
      await api.delete(`/teachers/${confirmId}`, {
        data: { reason: deactivationReason.trim() },
      });
      toast.success("تم تعطيل المعلم");
      setConfirmId(null);
      load(pagination.page);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل تعطيل المعلم");
    }
  };

  const doReactivate = async (id) => {
    setReactivating(id);
    try {
      await api.post(`/teachers/${id}/reactivate`);
      toast.success("تم إعادة تفعيل المعلم");
      load(pagination.page);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل إعادة تفعيل المعلم");
    }
    setReactivating(null);
  };

  const clearFilters = () =>
    setFilters({ gender: "", employmentStatus: "", specialization: "" });
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">المعلمون</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة سجلات المعلمين</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {has("teachers.create") && (
            <button
              onClick={() => nav("/teachers/new")}
              data-testid="add-teacher-btn"
              className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
            >
              <Plus className="h-4 w-4" /> إضافة معلم
            </button>
          )}
          {has("teachers.view") && (
            <button
              onClick={exportTeachers}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <Download className="h-4 w-4" /> تصدير
            </button>
          )}
          {has("teachers.create") && (
            <>
              <button
                onClick={() =>
                  downloadTemplate("teachers-template.csv", teacherTemplate)
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
                onChange={importTeachers}
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
              data-testid="teachers-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم / الهاتف / التخصص / الكود..."
              className="w-full rounded-lg border border-gray-300 pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-[#04CDF9]"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${hasActiveFilters ? "border-[#04CDF9] text-[#036A87] bg-brand-light" : "border-gray-300 text-gray-700"}`}
          >
            <Filter className="h-4 w-4" /> فلاتر{" "}
            {hasActiveFilters && (
              <span className="rounded-full bg-[#04CDF9] text-white text-[10px] px-1.5">
                {Object.values(filters).filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="p-4 border-b border-gray-200 bg-gray-50 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الجنس</label>
              <select
                value={filters.gender}
                onChange={(e) =>
                  setFilters({ ...filters, gender: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">الكل</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                الحالة الوظيفية
              </label>
              <select
                value={filters.employmentStatus}
                onChange={(e) =>
                  setFilters({ ...filters, employmentStatus: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">النشطون فقط</option>
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
                <option value="all">الكل</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">التخصص</label>
              <input
                value={filters.specialization}
                onChange={(e) =>
                  setFilters({ ...filters, specialization: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-3">
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
                <th className="px-4 py-3 font-medium">الجنس</th>
                <th className="px-4 py-3 font-medium">الهاتف</th>
                <th className="px-4 py-3 font-medium">التخصص</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    <Loader2 className="inline h-4 w-4 animate-spin ms-2" />{" "}
                    جاري التحميل...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    لا توجد نتائج.
                  </td>
                </tr>
              ) : (
                items.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                    data-testid={`teacher-row-${t.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {t.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {t.fullName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {GENDER_LABELS[t.gender] || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.specialization || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${t.employmentStatus === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}
                      >
                        {t.employmentStatus === "active" ? "نشط" : "غير نشط"}
                      </span>
                      {t.employmentStatus === "inactive" &&
                        t.deactivationReason && (
                          <div
                            className="mt-1 max-w-xs rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                            role="alert"
                          >
                            سبب التعطيل: {t.deactivationReason}
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <div className="inline-flex gap-1">
                        {has("teachers.update") && (
                          <button
                            onClick={() => nav(`/teachers/${t.id}/edit`)}
                            data-testid={`edit-teacher-${t.id}`}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {t.employmentStatus === "inactive"
                          ? has("teachers.update") && (
                              <button
                                onClick={() => doReactivate(t.id)}
                                disabled={reactivating === t.id}
                                data-testid={`reactivate-teacher-${t.id}`}
                                title="إعادة التفعيل"
                                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )
                          : has("teachers.delete") && (
                              <button
                                onClick={() => {
                                  setDeactivationReason("");
                                  setConfirmId(t.id);
                                }}
                                data-testid={`deactivate-teacher-${t.id}`}
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

        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              صفحة {pagination.page} من {pagination.totalPages}
            </div>
            <div className="flex gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
              >
                السابق
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => load(pagination.page + 1)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              تأكيد التعطيل
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              سيبقى المعلم وبياناته محفوظين، لكنه لن يظهر في القوائم العادية.
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
              placeholder="اكتب سبب تعطيل المعلم"
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
                data-testid="confirm-teacher-delete-btn"
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
