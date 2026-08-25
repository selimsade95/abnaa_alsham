import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2, Pencil, Loader2, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { GENDER_LABELS } from "@/lib/studentDefaults";

export default function Teachers() {
  const { has } = useAuth();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ gender: "", employmentStatus: "", specialization: "" });
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => { const t = setTimeout(() => setDebQ(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (debQ) params.search = debQ;
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await api.get("/teachers", { params });
      setItems(r.data.data); setPagination(r.data.pagination);
    } catch { toast.error("تعذر التحميل"); }
    setLoading(false);
  };
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, [debQ, filters]);

  const openNew = () => setEditing({ id: null, fullName: "", gender: "male", phone: "", address: "", specialization: "", qualification: "", employmentStatus: "active", notes: "" });
  const openEdit = (t) => setEditing({ ...t });

  const save = async (e) => {
    e.preventDefault();
    const { id, code, createdAt, updatedAt, ...body } = editing;
    try {
      if (id) await api.put(`/teachers/${id}`, body);
      else await api.post("/teachers", body);
      toast.success("تم الحفظ"); setEditing(null); load(pagination.page);
    } catch (e) { toast.error(e?.response?.data?.detail || "فشل الحفظ"); }
  };
  const doDelete = async () => {
    try { await api.delete(`/teachers/${confirmId}`); toast.success("تم الحذف"); setConfirmId(null); load(pagination.page); }
    catch (e) { toast.error(e?.response?.data?.detail || "فشل الحذف"); }
  };

  const clearFilters = () => setFilters({ gender: "", employmentStatus: "", specialization: "" });
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><h1 className="text-3xl font-bold text-gray-900">المعلمون</h1><p className="text-sm text-gray-500 mt-1">إدارة سجلات المعلمين</p></div>
        {has("teachers.create") && (
          <button onClick={openNew} data-testid="add-teacher-btn" className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"><Plus className="h-4 w-4" /> إضافة معلم</button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input data-testid="teachers-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم / الهاتف / التخصص / الكود..." className="w-full rounded-lg border border-gray-300 pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-[#04CDF9]" />
          </div>
          <button onClick={() => setShowFilters((s) => !s)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${hasActiveFilters ? "border-[#04CDF9] text-[#036A87] bg-brand-light" : "border-gray-300 text-gray-700"}`}>
            <Filter className="h-4 w-4" /> فلاتر {hasActiveFilters && <span className="rounded-full bg-[#04CDF9] text-white text-[10px] px-1.5">{Object.values(filters).filter(Boolean).length}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="p-4 border-b border-gray-200 bg-gray-50 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الجنس</label>
              <select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">الكل</option><option value="male">ذكر</option><option value="female">أنثى</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الحالة الوظيفية</label>
              <select value={filters.employmentStatus} onChange={(e) => setFilters({ ...filters, employmentStatus: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">الكل</option><option value="active">نشط</option><option value="inactive">غير نشط</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">التخصص</label>
              <input value={filters.specialization} onChange={(e) => setFilters({ ...filters, specialization: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-3">
              <button onClick={clearFilters} className="text-sm text-[#036A87] hover:underline">مسح الفلاتر</button>
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
              {loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500"><Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...</td></tr> :
                items.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">لا توجد نتائج.</td></tr> :
                items.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`teacher-row-${t.id}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{t.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{GENDER_LABELS[t.gender] || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{t.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{t.specialization || "—"}</td>
                    <td className="px-4 py-3"><span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${t.employmentStatus === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>{t.employmentStatus === "active" ? "نشط" : "غير نشط"}</span></td>
                    <td className="px-4 py-3 text-left">
                      <div className="inline-flex gap-1">
                        {has("teachers.update") && <button onClick={() => openEdit(t)} data-testid={`edit-teacher-${t.id}`} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>}
                        {has("teachers.delete") && <button onClick={() => setConfirmId(t.id)} data-testid={`delete-teacher-${t.id}`} className="p-1.5 rounded-md text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <Pagination page={pagination.page} total={pagination.totalPages} onPage={(p) => load(p)} />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 my-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editing.id ? "تعديل معلم" : "إضافة معلم"}</h3>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">الاسم الكامل *</label>
                  <input required data-testid="teacher-name" value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">الجنس</label>
                  <select value={editing.gender} onChange={(e) => setEditing({ ...editing, gender: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                    <option value="male">ذكر</option><option value="female">أنثى</option>
                  </select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">الهاتف</label>
                  <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">التخصص</label>
                  <input value={editing.specialization} onChange={(e) => setEditing({ ...editing, specialization: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">المؤهل</label>
                  <input value={editing.qualification} onChange={(e) => setEditing({ ...editing, qualification: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">الحالة الوظيفية</label>
                  <select value={editing.employmentStatus} onChange={(e) => setEditing({ ...editing, employmentStatus: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                    <option value="active">نشط</option><option value="inactive">غير نشط</option>
                  </select></div>
                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
                  <input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></div>
                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                  <textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
                <button type="submit" data-testid="save-teacher-btn" className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-600 mb-6">هل أنت متأكد من حذف هذا المعلم؟</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={doDelete} data-testid="confirm-teacher-delete-btn" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({ page, total, onPage }) {
  if (total <= 1) return null;
  return (
    <div className="p-4 border-t border-gray-200 flex items-center justify-between">
      <div className="text-xs text-gray-500">صفحة {page} من {total}</div>
      <div className="flex gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40">السابق</button>
        <button disabled={page >= total} onClick={() => onPage(page + 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40">التالي</button>
      </div>
    </div>
  );
}
