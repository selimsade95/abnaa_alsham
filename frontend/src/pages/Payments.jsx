import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2, Loader2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { SEMESTER_LABELS } from "@/lib/studentDefaults";

const PaymentBadge = ({ semester }) => {
  const styles = {
    first: "bg-blue-50 text-blue-700 border-blue-200",
    second: "bg-purple-50 text-purple-700 border-purple-200",
    full_year: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${styles[semester] || "bg-gray-50 text-gray-600 border-gray-200"}`}>{SEMESTER_LABELS[semester] || semester}</span>;
};

export default function Payments() {
  const { has } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [sem, setSem] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [students, setStudents] = useState([]);
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (debouncedQ) params.search = debouncedQ;
      if (year) params.academicYear = year;
      if (sem) params.semester = sem;
      const r = await api.get("/payments", { params });
      setItems(r.data);
    } catch { toast.error("تعذر تحميل المدفوعات"); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [debouncedQ, year, sem]);

  const openNew = async () => {
    if (students.length === 0) {
      try { const r = await api.get("/students"); setStudents(r.data); } catch {}
    }
    setEditing({ id: null, student: "", academicYear: "", semester: "full_year", amount: "", paymentDate: new Date().toISOString().slice(0, 10), notes: "" });
  };
  const openEdit = async (p) => {
    if (students.length === 0) { try { const r = await api.get("/students"); setStudents(r.data); } catch {} }
    setEditing({ ...p, paymentDate: (p.paymentDate || "").slice(0, 10) });
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = {
        student: editing.student, academicYear: editing.academicYear,
        semester: editing.semester, amount: Number(editing.amount),
        paymentDate: editing.paymentDate, notes: editing.notes || "",
      };
      if (editing.id) await api.put(`/payments/${editing.id}`, body);
      else await api.post("/payments", body);
      toast.success("تم الحفظ"); setEditing(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "فشل الحفظ"); }
  };
  const doDelete = async () => {
    try { await api.delete(`/payments/${confirmId}`); toast.success("تم الحذف"); setConfirmId(null); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "فشل الحذف"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">المدفوعات</h1>
          <p className="text-sm text-gray-500 mt-1">سجل مدفوعات رسوم التسجيل</p>
        </div>
        {has("payments.create") && (
          <button onClick={openNew} data-testid="add-payment-btn" className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]">
            <Plus className="h-4 w-4" /> إضافة دفعة
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input data-testid="payments-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الطالب..." className="w-full rounded-lg border border-gray-300 pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-[#04CDF9]" />
          </div>
          <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="سنة دراسية (مثال 2026-2027)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" data-testid="payments-year-filter" />
          <select value={sem} onChange={(e) => setSem(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" data-testid="payments-semester-filter">
            <option value="">كل الفصول</option>
            <option value="first">الفصل الأول</option>
            <option value="second">الفصل الثاني</option>
            <option value="full_year">السنة كاملة</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-right">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">الطالب</th>
                <th className="px-4 py-3 font-medium">السنة الدراسية</th>
                <th className="px-4 py-3 font-medium">الفصل</th>
                <th className="px-4 py-3 font-medium">المبلغ</th>
                <th className="px-4 py-3 font-medium">تاريخ الدفع</th>
                <th className="px-4 py-3 font-medium">سُجّل بواسطة</th>
                <th className="px-4 py-3 font-medium text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500"><Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">لا توجد مدفوعات.</td></tr>
              ) : items.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`payment-row-${p.id}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.studentName}</td>
                  <td className="px-4 py-3 text-gray-600">{p.academicYear || "—"}</td>
                  <td className="px-4 py-3"><PaymentBadge semester={p.semester} /></td>
                  <td className="px-4 py-3 font-semibold text-gray-900 tabular-nums">{p.amount}</td>
                  <td className="px-4 py-3 text-gray-600">{(p.paymentDate || "").slice(0, 10)}</td>
                  <td className="px-4 py-3 text-gray-600">{p.createdByName}</td>
                  <td className="px-4 py-3 text-left">
                    <div className="inline-flex gap-1">
                      {has("payments.update") && <button onClick={() => openEdit(p)} data-testid={`edit-payment-${p.id}`} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>}
                      {has("payments.delete") && <button onClick={() => setConfirmId(p.id)} data-testid={`delete-payment-${p.id}`} className="p-1.5 rounded-md text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editing.id ? "تعديل دفعة" : "إضافة دفعة"}</h3>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الطالب</label>
                <select required data-testid="payment-student-select" value={editing.student} onChange={(e) => setEditing({ ...editing, student: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]">
                  <option value="">اختر الطالب</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.student?.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">السنة الدراسية</label>
                <input required data-testid="payment-year-input" value={editing.academicYear} onChange={(e) => setEditing({ ...editing, academicYear: e.target.value })} placeholder="2026-2027" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الفصل</label>
                <select required data-testid="payment-semester-select" value={editing.semester} onChange={(e) => setEditing({ ...editing, semester: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]">
                  <option value="first">الفصل الأول</option>
                  <option value="second">الفصل الثاني</option>
                  <option value="full_year">السنة كاملة</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ</label>
                  <input required type="number" min="0.01" step="0.01" data-testid="payment-amount-input" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الدفع</label>
                  <input required type="date" data-testid="payment-date-input" value={editing.paymentDate} onChange={(e) => setEditing({ ...editing, paymentDate: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]" />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
                <button type="submit" data-testid="save-payment-btn" className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-600 mb-6">هل أنت متأكد من حذف هذه الدفعة؟</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={doDelete} data-testid="confirm-payment-delete-btn" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
