import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2, Loader2, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function Roles() {
  const { has } = useAuth();
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api.get("/roles"),
        api.get("/permissions"),
      ]);
      setRoles(r.data);
      setPerms(p.data);
    } catch {
      toast.error("تعذر تحميل الأدوار");
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const groups = perms.reduce((acc, p) => {
    (acc[p.resource] = acc[p.resource] || []).push(p);
    return acc;
  }, {});
  const RES_LABELS = {
    branches: "فروع المدرسة",
    students: "الطلاب",
    "students.gender": "تقييد عرض الطلاب حسب الجنس",
    "students.scope": "تقييد عرض الطلاب حسب الصف والجنس",
    payments: "المدفوعات",
    users: "المستخدمون",
    roles: "الأدوار",
    permissions: "الصلاحيات",
    auditLogs: "سجل التدقيق",
    subjects: "المواد",
    grades: "الدرجات",
    homework: "الواجبات",
    messages: "الرسائل",
    reports: "التقارير",
    "reports.finance": "تقارير المدفوعات",
  };

  const openNew = () =>
    setEditing({ id: null, name: "", description: "", permissions: [] });
  const openEdit = (r) => setEditing({ ...r });

  const togglePerm = (name) => {
    const s = new Set(editing.permissions);
    if (s.has(name)) s.delete(name);
    else s.add(name);
    setEditing({ ...editing, permissions: Array.from(s) });
  };
  const toggleGroup = (list, allSelected) => {
    const s = new Set(editing.permissions);
    if (allSelected) list.forEach((p) => s.delete(p.name));
    else list.forEach((p) => s.add(p.name));
    setEditing({ ...editing, permissions: Array.from(s) });
  };

  const save = async () => {
    if (!editing.name?.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    try {
      if (editing.id)
        await api.put(`/roles/${editing.id}`, {
          name: editing.name,
          description: editing.description,
          permissions: editing.permissions,
        });
      else
        await api.post("/roles", {
          name: editing.name,
          description: editing.description,
          permissions: editing.permissions,
        });
      toast.success("تم الحفظ");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    }
  };
  const doDelete = async () => {
    try {
      await api.delete(`/roles/${confirmId}`);
      toast.success("تم الحذف");
      setConfirmId(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحذف");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            الأدوار والصلاحيات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة أدوار المستخدمين ومنح الصلاحيات
          </p>
        </div>
        {has("roles.create") && (
          <button
            onClick={openNew}
            data-testid="add-role-btn"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" /> إضافة دور
          </button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm text-right">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">الوصف</th>
              <th className="px-4 py-3 font-medium">عدد الصلاحيات</th>
              <th className="px-4 py-3 font-medium text-left">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري
                  التحميل...
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  لا توجد أدوار.
                </td>
              </tr>
            ) : (
              roles.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-muted"
                  data-testid={`role-row-${r.name}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-accent-foreground" /> {r.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {r.permissions?.length || 0}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <div className="inline-flex gap-1">
                      {has("roles.update") && (
                        <button
                          onClick={() => openEdit(r)}
                          data-testid={`edit-role-${r.name}`}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {has("roles.delete") && (
                        <button
                          onClick={() => setConfirmId(r.id)}
                          data-testid={`delete-role-${r.name}`}
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 theme-scrim overflow-y-auto">
          <div className="bg-card rounded-xl shadow-xl max-w-3xl w-full my-8 border border-border">
            <div className="p-6 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">
                {editing.id ? "تعديل دور" : "إضافة دور"}
              </h3>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  الاسم
                </label>
                <input
                  data-testid="role-name-input"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  className="w-full rounded-lg border border-input px-3 py-2 focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  الوصف
                </label>
                <textarea
                  rows={2}
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-input px-3 py-2 focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  الصلاحيات
                </label>
                <div className="space-y-4">
                  {Object.entries(groups).map(([res, list]) => {
                    const all = list.every((p) =>
                      editing.permissions.includes(p.name),
                    );
                    return (
                      <div
                        key={res}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-semibold text-foreground">
                            {RES_LABELS[res] || res}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleGroup(list, all)}
                            className="text-xs text-accent-foreground hover:underline"
                          >
                            {all ? "إلغاء تحديد الكل" : "تحديد الكل"}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                          {list.map((p) => {
                            const checked = editing.permissions.includes(
                              p.name,
                            );
                            return (
                              <label
                                key={p.name}
                                className="inline-flex items-center gap-2 text-sm text-foreground py-1 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  data-testid={`perm-${p.name}`}
                                  checked={checked}
                                  onChange={() => togglePerm(p.name)}
                                  className="h-4 w-4 accent-[#04CDF9]"
                                />
                                <span>{p.description}</span>
                                <span className="text-[10px] text-muted-foreground ms-auto">
                                  {p.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-input bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={save}
                data-testid="save-role-btn"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 theme-scrim">
          <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6 border border-border">
            <h3 className="text-lg font-bold text-foreground mb-2">
              تأكيد الحذف
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              هل أنت متأكد من حذف هذا الدور؟
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-input bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={doDelete}
                data-testid="confirm-role-delete-btn"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
