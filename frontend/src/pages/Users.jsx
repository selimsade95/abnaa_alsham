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
          <h1 className="text-3xl font-bold text-gray-900">المستخدمون</h1>
          <p className="mt-1 text-sm text-gray-500">
            إدارة حسابات الوصول والأدوار والفروع المسموح بها
          </p>
        </div>
        {has("users.create") && (
          <Link
            to="/users/new"
            data-testid="add-user-btn"
            className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
          >
            <Plus className="h-4 w-4" />
            إضافة مستخدم
          </Link>
        )}
      </header>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
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
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                  جاري التحميل...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  لا يوجد مستخدمون.
                </td>
              </tr>
            ) : (
              items.map((account) => (
                <tr
                  key={account.id}
                  className="border-t border-gray-100 hover:bg-gray-50"
                  data-testid={`user-row-${account.id}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      to={`/users/${account.id}`}
                      className="hover:text-[#036A87] hover:underline"
                    >
                      {account.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    @{account.username}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(account.roles || []).map((roleId) => (
                        <span
                          key={roleId}
                          className="inline-flex rounded-full border border-[#04CDF9]/30 bg-brand-light px-2 py-0.5 text-xs text-[#036A87]"
                        >
                          {roleName(roleId)}
                        </span>
                      ))}
                      {!account.roles?.length && (
                        <span className="text-xs text-gray-400">لا يوجد</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(account.branchIds || []).map((branchId) => (
                        <span
                          key={branchId}
                          className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {user?.branches?.find(
                            (branch) => branch.id === branchId,
                          )?.name || "فرع آخر"}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {account.createdAt?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <div className="inline-flex gap-1">
                      {has("users.update") && (
                        <Link
                          to={`/users/${account.id}/edit`}
                          aria-label={`تعديل ${account.name}`}
                          data-testid={`edit-user-${account.id}`}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-bold text-gray-900">
              تأكيد الحذف
            </h2>
            <p className="mb-6 text-sm text-gray-600">
              هل أنت متأكد من حذف هذا المستخدم؟
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
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
