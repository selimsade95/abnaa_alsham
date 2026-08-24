import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function Users() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get("/users")
      .then((r) => setItems(r.data))
      .catch(() => toast.error("تعذر تحميل المستخدمين"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/users", form);
      toast.success("تم إنشاء المستخدم");
      setForm({ name: "", username: "", password: "" });
      setShowAdd(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "تعذر إنشاء المستخدم");
    } finally {
      setCreating(false);
    }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/users/${confirmId}`);
      toast.success("تم حذف المستخدم");
      setConfirmId(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "تعذر حذف المستخدم");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">المستخدمون</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة حسابات الوصول إلى النظام</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          data-testid="add-user-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
        >
          <Plus className="h-4 w-4" />
          إضافة مستخدم
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm text-right">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">اسم المستخدم</th>
              <th className="px-4 py-3 font-medium">تاريخ الإنشاء</th>
              <th className="px-4 py-3 font-medium text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                  <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                  لا يوجد مستخدمون.
                </td>
              </tr>
            ) : (
              items.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">@{u.username}</td>
                  <td className="px-4 py-3 text-gray-600">{u.createdAt?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-left">
                    <button
                      onClick={() => setConfirmId(u.id)}
                      disabled={u.id === user?.id}
                      data-testid={`user-delete-btn-${u.id}`}
                      title={u.id === user?.id ? "لا يمكنك حذف حسابك" : "حذف"}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add user dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">إضافة مستخدم جديد</h3>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                <input
                  data-testid="user-name-input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#04CDF9]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المستخدم</label>
                <input
                  data-testid="user-username-input"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#04CDF9]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                <input
                  data-testid="user-password-input"
                  required
                  type="password"
                  minLength={4}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#04CDF9]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  data-testid="user-submit-btn"
                  className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60"
                >
                  {creating ? "جاري الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-600 mb-6">هل أنت متأكد من حذف هذا المستخدم؟</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                إلغاء
              </button>
              <button onClick={doDelete} data-testid="confirm-user-delete-btn" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
