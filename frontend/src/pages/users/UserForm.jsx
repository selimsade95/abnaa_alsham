import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

const emptyForm = {
  name: "",
  username: "",
  password: "",
  roles: [],
  teacherId: "",
  branchIds: [],
};

export default function UserForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditing = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [roles, setRoles] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const requests = [
          api.get("/roles"),
          api.get("/teachers", { params: { limit: 500 } }),
        ];
        if (isEditing) requests.push(api.get(`/users/${id}`));
        const responses = await Promise.all(requests);
        if (cancelled) return;
        setRoles(responses[0].data);
        setTeachers(responses[1].data.data || []);
        if (isEditing) {
          const account = responses[2].data;
          setForm({
            id: account.id,
            name: account.name || "",
            username: account.username || "",
            password: "",
            roles: account.roles || [],
            teacherId: account.teacherId || "",
            branchIds:
              account.branchIds ||
              (user?.activeBranch?.id ? [user.activeBranch.id] : []),
          });
        } else {
          setForm({
            ...emptyForm,
            branchIds: user?.activeBranch?.id ? [user.activeBranch.id] : [],
          });
        }
      } catch (error) {
        toast.error(error?.response?.data?.detail || "تعذر تحميل بيانات المستخدم");
        if (isEditing) navigate("/users", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, isEditing, navigate, user?.activeBranch?.id]);

  const toggle = (field, value) => {
    const selected = new Set(form[field]);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    setForm({ ...form, [field]: Array.from(selected) });
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || (!isEditing && !form.username.trim())) return;
    if (!isEditing && form.password.length < 4) {
      toast.error("كلمة المرور 4 أحرف على الأقل");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        roles: form.roles,
        teacherId: form.teacherId || null,
        branchIds: form.branchIds,
      };
      if (isEditing) {
        if (form.password) body.password = form.password;
        await api.put(`/users/${id}`, body);
      } else {
        await api.post("/users", {
          ...body,
          username: form.username.trim(),
          password: form.password,
        });
      }
      toast.success(isEditing ? "تم تحديث المستخدم" : "تم إنشاء المستخدم");
      navigate(isEditing ? `/users/${id}` : "/users", { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر حفظ المستخدم");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-500">
        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
        جاري التحميل...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link
          to={isEditing ? `/users/${id}` : "/users"}
          className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowRight className="h-4 w-4" />
          {isEditing ? "تفاصيل المستخدم" : "المستخدمون"}
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditing ? "تعديل المستخدم" : "إضافة مستخدم"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          حدد بيانات الحساب والأدوار والفروع المسموح بها.
        </p>
      </header>

      <form
        onSubmit={save}
        className="space-y-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
      >
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            الاسم
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              data-testid="user-name-input"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            اسم المستخدم
            <input
              required
              disabled={isEditing}
              value={form.username}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
              data-testid="user-username-input"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-50"
            />
          </label>
          <label className="text-sm font-medium text-gray-700 sm:col-span-2">
            {isEditing ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور"}
            <input
              type="password"
              required={!isEditing}
              minLength={isEditing ? 0 : 4}
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              data-testid="user-password-input"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-800">الأدوار</h2>
          <div className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
            {roles.map((role) => (
              <label
                key={role.id}
                className="flex cursor-pointer items-center gap-2 py-1 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={form.roles.includes(role.id)}
                  onChange={() => toggle("roles", role.id)}
                  data-testid={`user-role-${role.name}`}
                  className="h-4 w-4 accent-[#04CDF9]"
                />
                <span>{role.name}</span>
                {role.description && (
                  <span className="text-xs text-gray-400">
                    — {role.description}
                  </span>
                )}
              </label>
            ))}
            {roles.length === 0 && (
              <p className="text-sm text-gray-500">لا توجد أدوار متاحة.</p>
            )}
          </div>
        </section>

        {user?.branches?.length > 1 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-800">
              فروع الوصول
            </h2>
            <div className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
              {user.branches.map((branch) => (
                <label
                  key={branch.id}
                  className="flex cursor-pointer items-center gap-2 py-1 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={form.branchIds.includes(branch.id)}
                    onChange={() => toggle("branchIds", branch.id)}
                    className="h-4 w-4 accent-[#04CDF9]"
                  />
                  {branch.name}
                </label>
              ))}
            </div>
          </section>
        )}

        <label className="block text-sm font-medium text-gray-700">
          ربط بحساب معلم
          <select
            value={form.teacherId}
            onChange={(event) =>
              setForm({ ...form, teacherId: event.target.value })
            }
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">— بدون ربط —</option>
            {teachers
              .filter(
                (teacher) =>
                  teacher.employmentStatus === "active" ||
                  teacher.id === form.teacherId,
              )
              .map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </option>
              ))}
          </select>
        </label>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Link
            to={isEditing ? `/users/${id}` : "/users"}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
          >
            إلغاء
          </Link>
          <button
            type="submit"
            disabled={saving}
            data-testid="user-submit-btn"
            className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </button>
        </div>
      </form>
    </div>
  );
}
