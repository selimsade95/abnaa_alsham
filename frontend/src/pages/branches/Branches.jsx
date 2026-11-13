import { useEffect, useState } from "react";
import { Building2, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get("/branches");
      setBranches(response.data);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر تحميل الفروع");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (event) => {
    event.preventDefault();
    const name = editing.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api.put(`/branches/${editing.id}`, {
          name,
          active: editing.active,
        });
      } else {
        await api.post("/branches", { name, active: true });
      }
      toast.success("تم حفظ الفرع");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر حفظ الفرع");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">فروع المدرسة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أنشئ الفروع وحدد الحسابات المسموح لها بالوصول إليها.
          </p>
        </div>
        <button
          onClick={() =>
            setEditing({ id: null, name: "", active: true })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          data-testid="add-branch-btn"
        >
          <Plus className="h-4 w-4" />
          إضافة فرع
        </button>
      </header>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
            جاري التحميل...
          </div>
        ) : branches.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            لا توجد فروع.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {branches.map((branch) => (
              <li
                key={branch.id}
                className="flex items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-lg bg-accent p-2 text-accent-foreground">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">
                      {branch.name}
                      {branch.isDefault && (
                        <span className="ms-2 text-xs font-normal text-muted-foreground">
                          الفرع الرئيسي
                        </span>
                      )}
                    </div>
                    <div
                      className={`mt-1 text-xs ${
                        branch.active === false
                          ? "text-muted-foreground"
                          : "text-green-700"
                      }`}
                    >
                      {branch.active === false ? "معطل" : "نشط"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setEditing({
                      id: branch.id,
                      name: branch.name,
                      active: branch.active !== false,
                    })
                  }
                  className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
                  aria-label={`تعديل ${branch.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center theme-scrim p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-foreground">
              {editing.id ? "تعديل فرع" : "إضافة فرع"}
            </h2>
            <form onSubmit={save} className="space-y-4">
              <label className="block text-sm font-medium text-foreground">
                اسم الفرع
                <input
                  autoFocus
                  required
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({ ...editing, name: event.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-input px-3 py-2"
                  data-testid="branch-name-input"
                />
              </label>
              {editing.id && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    disabled={branches.find((item) => item.id === editing.id)?.isDefault}
                    onChange={(event) =>
                      setEditing({ ...editing, active: event.target.checked })
                    }
                    className="h-4 w-4 accent-[#04CDF9]"
                  />
                  فرع نشط
                </label>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-input px-4 py-2 text-sm text-foreground"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "جاري الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
