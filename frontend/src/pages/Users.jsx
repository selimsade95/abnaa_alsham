import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function Users() {
  const { user, has } = useAuth();
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.get("/users"), api.get("/roles").catch(() => ({ data: [] }))]);
      setItems(u.data); setRoles(r.data);
    } catch { toast.error("تعذر تحميل المستخدمين"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ id: null, name: "", username: "", password: "", roles: [] });
  const openEdit = (u) => setEditing({ id: u.id, name: u.name, username: u.username, password: "", roles: u.roles || [] });

  const toggleRole = (rid) => {
    const s = new Set(editing.roles);
    if (s.has(rid)) s.delete(rid); else s.add(rid);
    setEditing({ ...editing, roles: Array.from(s) });
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing.id) {
        const body = { name: editing.name, roles: editing.roles };
        if (editing.password) body.password = editing.password;
        await api.put(`/users/${editing.id}`, body);
      } else {
        if (!editing.password || editing.password.length < 4) { toast.error("كلمة المرور 4 أحرف على الأقل"); return; }
        await api.post("/users", { name: editing.name, username: editing.username, password: editing.password, roles: editing.roles });
      }
      toast.success("تم الحفظ"); setEditing(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "فشل الحفظ"); }
  };
  const doDelete = async () => {
    try { await api.delete(`/users/${confirmId}`); toast.success("تم الحذف"); setConfirmId(null); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "فشل الحذف"); }
  };

  const roleName = (rid) => roles.find((r) => r.id === rid)?.name || "—";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">المستخدمون</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة حسابات الوصول والأدوار</p>
        </div>
        {has("users.create") && (
          <button onClick={openNew} data-testid="add-user-btn" className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]">
            <Plus className="h-4 w-4" /> إضافة مستخدم
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm text-right">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">اسم المستخدم</th>
              <th className="px-4 py-3 font-medium">الأدوار</th>
              <th className="px-4 py-3 font-medium">تاريخ الإنشاء</th>
              <th className="px-4 py-3 font-medium text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500"><Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">لا يوجد مستخدمون.</td></tr>
            ) : items.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50" data-testid={`user-row-${u.id}`}>
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">@{u.username}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(u.roles || []).map((rid) => (
                      <span key={rid} className="inline-flex text-xs px-2 py-0.5 rounded-full bg-brand-light text-[#036A87] border border-[#04CDF9]/30">{roleName(rid)}</span>
                    ))}
                    {(!u.roles || u.roles.length === 0) && <span className="text-xs text-gray-400">لا يوجد</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.createdAt?.slice(0, 10)}</td>
                <td className="px-4 py-3 text-left">
                  <div className="inline-flex gap-1">
                    {has("users.update") && <button onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`} className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"><Pencil className="h-4 w-4" /></button>}
                    {has("users.delete") && <button onClick={() => setConfirmId(u.id)} disabled={u.id === user?.id} data-testid={`user-delete-btn-${u.id}`} className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editing.id ? "تعديل مستخدم" : "إضافة مستخدم"}</h3>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                <input data-testid="user-name-input" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">اسم المستخدم</label>
                <input data-testid="user-username-input" required disabled={!!editing.id} value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9] disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{editing.id ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"}</label>
                <input data-testid="user-password-input" type="password" required={!editing.id} minLength={editing.id ? 0 : 4} value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الأدوار</label>
                <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                      <input type="checkbox" data-testid={`user-role-${r.name}`} checked={editing.roles.includes(r.id)} onChange={() => toggleRole(r.id)} className="h-4 w-4 accent-[#04CDF9]" />
                      <span>{r.name}</span>
                      <span className="text-[10px] text-gray-400">— {r.description}</span>
                    </label>
                  ))}
                  {roles.length === 0 && <div className="text-xs text-gray-500 py-1">لا توجد أدوار متاحة</div>}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
                <button type="submit" data-testid="user-submit-btn" className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]">حفظ</button>
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
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={doDelete} data-testid="confirm-user-delete-btn" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
