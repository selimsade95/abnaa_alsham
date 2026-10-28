import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9]";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const empty = () => ({
  fullName: "",
  gender: "male",
  fatherName: "",
  motherName: "",
  birthPlace: "",
  birthDate: "",
  idNumber: "",
  address: "",
  martialStatus: "",
  maleChildrenCount: "",
  femaleChildrenCount: "",
  workStartDate: "",
  department: "",
  office: "",
  education: "",
  volunteer: "",
  jobDescription: "",
  skills: "",
  contactPhone: "",
  certificate: "",
  employmentStatus: "active",
  notes: "",
});

export default function TeacherForm({ mode }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(empty());
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificateUpload, setCertificateUpload] = useState(null);

  useEffect(() => {
    if (mode === "edit" && id) {
      api
        .get(`/teachers/${id}`)
        .then((r) => {
          const teacher = r.data;
          setData({
            ...empty(),
            ...teacher,
            contactPhone: teacher.contactPhone ?? teacher.phone ?? "",
            education: teacher.education ?? teacher.qualification ?? "",
            jobDescription:
              teacher.jobDescription ?? teacher.specialization ?? "",
            martialStatus:
              teacher.martialStatus ?? teacher.maritalStatus ?? "",
            volunteer:
              typeof teacher.volunteer === "boolean"
                ? String(teacher.volunteer)
                : teacher.volunteer || "",
          });
          setCertificateFile(teacher.certificateFile || null);
          setCode(r.data.code || "");
        })
        .catch(() => toast.error("تعذر التحميل"))
        .finally(() => setLoading(false));
    }
  }, [id, mode]);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!data.fullName.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...data,
        phone: data.contactPhone,
        qualification: data.education,
        specialization: data.jobDescription || data.department,
      };
      let teacherId = id;
      if (mode === "edit") {
        await api.put(`/teachers/${id}`, payload);
      } else {
        const response = await api.post("/teachers", payload);
        teacherId = response.data.id;
      }
      if (certificateUpload) {
        const formData = new FormData();
        formData.append("file", certificateUpload);
        try {
          const response = await api.post(
            `/teachers/${teacherId}/certificate`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
          setCertificateFile(response.data);
        } catch (error) {
          toast.error(
            error?.response?.data?.detail ||
              "تم حفظ بيانات المعلم لكن تعذر رفع الشهادة",
          );
          setSaving(false);
          if (mode !== "edit") nav(`/teachers/${teacherId}/edit`);
          return;
        }
      }
      toast.success("تم الحفظ");
      nav("/teachers");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    }
    setSaving(false);
  };

  if (loading)
    return (
      <div className="text-center text-gray-500 py-16">
        <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-6" data-testid="teacher-form">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={() => nav("/teachers")}
            className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {mode === "edit" ? "تعديل بيانات معلم" : "إضافة معلم جديد"}
          </h1>
          {code && (
            <p className="text-sm text-gray-500 mt-1">
              الكود: <span className="font-mono">{code}</span>
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          data-testid="save-teacher-btn"
          className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60"
        >
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
          المعلومات الشخصية
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم الكامل" required>
            <input
              required
              data-testid="teacher-name"
              className={inputCls}
              value={data.fullName}
              onChange={(e) => set("fullName", e.target.value)}
            />
          </Field>
          <Field label="الجنس">
            <select
              className={inputCls}
              value={data.gender}
              onChange={(e) => set("gender", e.target.value)}
            >
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </Field>
          <Field label="اسم الأب">
            <input
              className={inputCls}
              value={data.fatherName}
              onChange={(e) => set("fatherName", e.target.value)}
            />
          </Field>
          <Field label="اسم الأم">
            <input
              className={inputCls}
              value={data.motherName}
              onChange={(e) => set("motherName", e.target.value)}
            />
          </Field>
          <Field label="مكان الولادة">
            <input
              className={inputCls}
              value={data.birthPlace}
              onChange={(e) => set("birthPlace", e.target.value)}
            />
          </Field>
          <Field label="تاريخ الولادة">
            <input
              type="date"
              className={inputCls}
              value={data.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
            />
          </Field>
          <Field label="رقم الهوية">
            <input
              className={inputCls}
              value={data.idNumber}
              onChange={(e) => set("idNumber", e.target.value)}
            />
          </Field>
          <Field label="العنوان">
            <input
              className={inputCls}
              value={data.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <Field label="الحالة الاجتماعية">
            <input
              className={inputCls}
              value={data.martialStatus}
              onChange={(e) => set("martialStatus", e.target.value)}
            />
          </Field>
          <Field label="عدد الأبناء الذكور">
            <input
              type="number"
              min="0"
              className={inputCls}
              value={data.maleChildrenCount}
              onChange={(e) => set("maleChildrenCount", e.target.value)}
            />
          </Field>
          <Field label="عدد الأبناء الإناث">
            <input
              type="number"
              min="0"
              className={inputCls}
              value={data.femaleChildrenCount}
              onChange={(e) => set("femaleChildrenCount", e.target.value)}
            />
          </Field>
          <Field label="الهاتف">
            <input
              type="tel"
              className={inputCls}
              value={data.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
          المعلومات الوظيفية
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="تاريخ بدء العمل">
            <input
              type="date"
              className={inputCls}
              value={data.workStartDate}
              onChange={(e) => set("workStartDate", e.target.value)}
            />
          </Field>
          <Field label="القسم">
            <input
              className={inputCls}
              value={data.department}
              onChange={(e) => set("department", e.target.value)}
            />
          </Field>
          <Field label="المكتب">
            <input
              className={inputCls}
              value={data.office}
              onChange={(e) => set("office", e.target.value)}
            />
          </Field>
          <Field label="المؤهل العلمي">
            <input
              className={inputCls}
              value={data.education}
              onChange={(e) => set("education", e.target.value)}
            />
          </Field>
          <Field label="متطوع">
            <select
              className={inputCls}
              value={data.volunteer}
              onChange={(e) => set("volunteer", e.target.value)}
            >
              <option value="">غير محدد</option>
              <option value="true">نعم</option>
              <option value="false">لا</option>
            </select>
          </Field>
          <Field label="الحالة الوظيفية">
            <select
              className={inputCls}
              value={data.employmentStatus}
              onChange={(e) => set("employmentStatus", e.target.value)}
            >
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="الوصف الوظيفي">
              <textarea
                rows={3}
                className={inputCls}
                value={data.jobDescription}
                onChange={(e) => set("jobDescription", e.target.value)}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="المهارات">
              <textarea
                rows={3}
                className={inputCls}
                value={data.skills}
                onChange={(e) => set("skills", e.target.value)}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="الشهادة">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className={inputCls}
                onChange={(e) =>
                  setCertificateUpload(e.target.files?.[0] || null)
                }
              />
              <p className="mt-1 text-xs text-gray-500">
                {certificateUpload?.name ||
                  certificateFile?.originalName ||
                  data.certificate ||
                  "PDF أو JPG أو PNG، بحد أقصى 10 ميغابايت"}
              </p>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="ملاحظات">
              <textarea
                rows={3}
                className={inputCls}
                value={data.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => nav("/teachers")}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60"
        >
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
    </form>
  );
}
