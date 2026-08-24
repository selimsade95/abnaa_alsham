import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Search, Plus, Eye, Pencil, Trash2, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABELS, GENDER_LABELS } from "@/lib/studentDefaults";

export default function StudentsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = () => {
    setLoading(true);
    api
      .get("/students", { params: debouncedQ ? { search: debouncedQ } : {} })
      .then((r) => setItems(r.data))
      .catch(() => toast.error("تعذر تحميل الطلاب"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [debouncedQ]);

  const doDelete = async () => {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${confirmId}`);
      toast.success("تم حذف الطالب");
      setConfirmId(null);
      load();
    } catch {
      toast.error("تعذر حذف الطالب");
    } finally {
      setDeleting(false);
    }
  };

  const rows = useMemo(() => items, [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">الطلاب</h1>
          <p className="text-sm text-gray-500 mt-1">جميع الطلاب المسجلين في النظام</p>
        </div>
        <Link
          to="/students/new"
          data-testid="add-student-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1] transition-colors"
        >
          <Plus className="h-4 w-4" />
          إضافة طالب
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              data-testid="students-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم الطالب..."
              className="w-full rounded-lg border border-gray-300 bg-white pr-9 pl-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9] focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-right">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">الاسم الكامل</th>
                <th className="px-4 py-3 font-medium">الجنس</th>
                <th className="px-4 py-3 font-medium">تاريخ الميلاد</th>
                <th className="px-4 py-3 font-medium">الصف السابق</th>
                <th className="px-4 py-3 font-medium">الصف الجديد</th>
                <th className="px-4 py-3 font-medium">الوضع</th>
                <th className="px-4 py-3 font-medium">يتيم</th>
                <th className="px-4 py-3 font-medium text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500" data-testid="students-empty">
                    لا يوجد طلاب مطابقون.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`student-row-${s.id}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.student?.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{GENDER_LABELS[s.student?.gender] || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{s.student?.birthdate?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{s.student?.previousClass || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{s.student?.newClass || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{STATUS_LABELS[s.student?.status] || "—"}</td>
                    <td className="px-4 py-3">
                      {s.student?.orphan ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 text-xs font-medium px-2 py-0.5 border border-amber-200">
                          نعم
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-50 text-gray-600 text-xs px-2 py-0.5 border border-gray-200">
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
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => nav(`/students/${s.id}/edit`)}
                          data-testid={`edit-btn-${s.id}`}
                          title="تعديل"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => window.open(`/students/${s.id}/print`, "_blank")}
                          data-testid={`print-btn-${s.id}`}
                          title="طباعة"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmId(s.id)}
                          data-testid={`delete-btn-${s.id}`}
                          title="حذف"
                          className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm delete */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-600 mb-6">
              هل أنت متأكد من حذف هذا الطالب؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={doDelete}
                disabled={deleting}
                data-testid="confirm-delete-btn"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "جاري الحذف..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
