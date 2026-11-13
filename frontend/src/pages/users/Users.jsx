import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Users() {
  const { user, has } = useAuth();
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        api.get("/users"),
        api.get("/roles"),
      ]);
      setItems(usersResponse.data);
      setRoles(rolesResponse.data);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const roleName = (roleId) =>
    roles.find((role) => role.id === roleId)?.name || "—";

  const doDelete = async () => {
    try {
      await api.delete(`/users/${confirmId}`);
      toast.success("تم حذف المستخدم");
      setConfirmId(null);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر حذف المستخدم");
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">المستخدمون</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة حسابات الوصول والأدوار والفروع المسموح بها
          </p>
        </div>
        {has("users.create") && (
          <Link
            to="/users/new"
            data-testid="add-user-btn"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            <Plus className="h-4 w-4" />
            إضافة مستخدم
          </Link>
        )}
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">اسم المستخدم</th>
              <th className="px-4 py-3 font-medium">الأدوار</th>
              <th className="px-4 py-3 font-medium">فروع الوصول</th>
              <th className="px-4 py-3 font-medium">تاريخ الإنشاء</th>
              <th className="px-4 py-3 text-left font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                  جاري التحميل...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  لا يوجد مستخدمون.
                </td>
              </tr>
            ) : (
              items.map((account) => (
                <tr
                  key={account.id}
                  className="border-t border-border hover:bg-muted"
                  data-testid={`user-row-${account.id}`}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      to={`/users/${account.id}`}
                      className="hover:text-accent-foreground hover:underline"
                    >
                      {account.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    @{account.username}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(account.roles || []).map((roleId) => (
                        <span
                          key={roleId}
                          className="inline-flex rounded-full border border-[#04CDF9]/30 bg-brand-light px-2 py-0.5 text-xs text-accent-foreground"
                        >
                          {roleName(roleId)}
                        </span>
                      ))}
                      {!account.roles?.length && (
                        <span className="text-xs text-muted-foreground">لا يوجد</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(account.branchIds || []).map((branchId) => (
                        <span
                          key={branchId}
                          className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {user?.branches?.find(
                            (branch) => branch.id === branchId,
                          )?.name || "فرع آخر"}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.createdAt?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <div className="inline-flex gap-1">
                      {has("users.update") && (
                        <Link
                          to={`/users/${account.id}/edit`}
                          aria-label={`تعديل ${account.name}`}
                          data-testid={`edit-user-${account.id}`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      )}
                      {has("users.delete") && (
                        <button
                          onClick={() => setConfirmId(account.id)}
                          disabled={account.id === user?.id}
                          aria-label={`حذف ${account.name}`}
                          data-testid={`user-delete-btn-${account.id}`}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
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

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center theme-scrim p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-foreground">
              تأكيد الحذف
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              هل أنت متأكد من حذف هذا المستخدم؟
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-input px-4 py-2 text-sm text-foreground"
              >
                إلغاء
              </button>
              <button
                onClick={doDelete}
                data-testid="confirm-user-delete-btn"
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
