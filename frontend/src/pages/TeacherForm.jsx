import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";

const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9]";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
    {children}
  </div>
);

const empty = () => ({
  fullName: "", gender: "male", phone: "", address: "",
  specialization: "", qualification: "", employmentStatus: "active", notes: "",
});

export default function TeacherForm({ mode }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(empty());
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (mode === "edit" && id) {
      api.get(`/teachers/${id}`).then((r) => { setData({ ...empty(), ...r.data }); setCode(r.data.code || ""); })
        .catch(() => toast.error("تعذر التحميل"))
        .finally(() => setLoading(false));
    }
  }, [id, mode]);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!data.fullName.trim()) { toast.error("الاسم مطلوب"); return; }
    setSaving(true);
    try {
      if (mode === "edit") await api.put(`/teachers/${id}`, data);
      else await api.post("/teachers", data);
      toast.success("تم الحفظ");
      nav("/teachers");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    }
    setSaving(false);
  };

  if (loading) return <div className="text-center text-gray-500 py-16"><Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...</div>;

  return (
    <form onSubmit={submit} className="space-y-6" data-testid="teacher-form">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <button type="button" onClick={() => nav("/teachers")} className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2"><ArrowRight className="h-4 w-4" /> رجوع</button>
          <h1 className="text-3xl font-bold text-gray-900">{mode === "edit" ? "تعديل بيانات معلم" : "إضافة معلم جديد"}</h1>
          {code && <p className="text-sm text-gray-500 mt-1">الكود: <span className="font-mono">{code}</span></p>}
        </div>
        <button type="submit" disabled={saving} data-testid="save-teacher-btn" className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60">
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">المعلومات الأساسية</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم الكامل" required>
            <input required data-testid="teacher-name" className={inputCls} value={data.fullName} onChange={(e) => set("fullName", e.target.value)} />
          </Field>
          <Field label="الجنس">
            <select className={inputCls} value={data.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="male">ذكر</option><option value="female">أنثى</option>
            </select>
          </Field>
          <Field label="الهاتف">
            <input className={inputCls} value={data.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="العنوان">
            <input className={inputCls} value={data.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="التخصص">
            <input className={inputCls} value={data.specialization} onChange={(e) => set("specialization", e.target.value)} />
          </Field>
          <Field label="المؤهل">
            <input className={inputCls} value={data.qualification} onChange={(e) => set("qualification", e.target.value)} />
          </Field>
          <Field label="الحالة الوظيفية">
            <select className={inputCls} value={data.employmentStatus} onChange={(e) => set("employmentStatus", e.target.value)}>
              <option value="active">نشط</option><option value="inactive">غير نشط</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="ملاحظات">
              <textarea rows={3} className={inputCls} value={data.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => nav("/teachers")} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60">{saving ? "جاري الحفظ..." : "حفظ"}</button>
      </div>
    </form>
  );
}
