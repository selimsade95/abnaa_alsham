import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { emptyStudent } from "@/lib/studentDefaults";

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9] focus:border-transparent";

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
      {title}
    </h3>
    <div className="space-y-4">{children}</div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

const Radio = ({ name, checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer">
    <input
      type="radio"
      name={name}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 accent-[#04CDF9]"
    />
    <span className="text-sm text-gray-700">{label}</span>
  </label>
);

// All Excel-based fullInfo fields with Arabic labels
const FULL_INFO_FIELDS = [
  // Basic serials / registration numbers
  ["serial", "م"],
  ["classSerial", "تسلسل صفي"],
  ["classSection", "الصف - الشعبة (نص)"],
  ["serial2", "م2"],
  ["department", "القسم"],
  ["generalRegNumber", "رقم السجل العام"],
  ["ministerialNumber", "الرقم الوزاري"],
  // Name components
  ["fatherFirstName", "اسم الأب"],
  ["familyName", "النسبة"],
  ["secondName", "الاسم الثاني"],
  ["tripleName", "الاسم الثلاثي"],
  ["motherTripleName", "اسم الأم الثلاثي"],
  ["grandfatherName", "اسم الجد"],
  // Personal
  ["ageYears", "العمر بالسنوات"],
  ["nationality", "الجنسية"],
  ["familyStatus", "حالة الطالب الأسرية"],
  ["primaryLanguage", "لغة الطالب"],
  ["distinctiveMarks", "علامات مميزة"],
  ["bloodType", "زمرة الدم"],
  ["familySize", "عدد أفراد العائلة"],
  ["siblingsInSchool", "عدد الإخوة في المدرسة"],
  ["livesWith", "مع من يسكن الطالب"],
  // Housing
  ["housingGovernorate", "المحافظة (السكن)"],
  ["housingRegion", "المنطقة"],
  ["housingDistrict", "الناحية"],
  ["housingTown", "البلدة"],
  ["recordNumber", "رقم المحضر"],
  ["housingType", "نوع المسكن"],
  ["housingOwnership", "ملكية السكن (ملك/إيجار)"],
  // Parents extras
  ["fatherMaritalStatus", "الحالة الاجتماعية للأب"],
  ["fatherSpecialty", "اختصاص الأب في مهنته"],
  ["motherMaritalStatus", "الحالة الاجتماعية للأم"],
  ["motherSpecialty", "اختصاص الأم في مهنتها"],
  // Civil registration
  ["originalGovernorate", "المحافظة الأصلية"],
  ["registrationAmana", "الأمانة"],
  ["registrationPlace", "مكان القيد"],
  ["registrationNumber", "رقم القيد"],
  // School enrollment
  ["enrollmentDate", "تاريخ الالتحاق بالمدرسة"],
  ["enrollmentClass", "صف الالتحاق"],
  ["branch", "الفرع"],
  ["class2", "الصف2"],
  // Physical
  ["height", "قياس الطول"],
  ["width", "قياس العرض"],
  ["footSize", "قياس القدم"],
  ["uniformSize", "قياس الثوب"],
  ["weight", "الوزن"],
];

export default function StudentFullInfoEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get(`/students/${id}`)
      .then((r) => {
        const d = r.data;
        if (d.student?.birthdate)
          d.student.birthdate = d.student.birthdate.slice(0, 10);
        setData({
          ...emptyStudent(),
          ...d,
          student: { ...emptyStudent().student, ...d.student },
          fullInfo: { ...emptyStudent().fullInfo, ...(d.fullInfo || {}) },
          currentClassId: d.currentClassId || "",
        });
      })
      .catch(() => toast.error("تعذر التحميل"))
      .finally(() => setLoading(false));
  }, [id]);

  const updateFI = (k, v) =>
    setData((prev) => ({ ...prev, fullInfo: { ...prev.fullInfo, [k]: v } }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = structuredClone(data);
      // ensure fees only has known keys
      payload.fees = {
        academicYear: data.fees?.academicYear || "",
        totalPayable: data.fees?.totalPayable || 0,
      };
      delete payload.initialPayment;
      if (payload.student.birthdate?.length === 10)
        payload.student.birthdate = `${payload.student.birthdate}T00:00:00`;
      await api.put(`/students/${id}`, payload);
      toast.success("تم الحفظ");
      nav(`/students/${id}/full-information`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "فشل الحفظ");
    }
    setSaving(false);
  };

  if (loading || !data)
    return (
      <div className="text-center text-gray-500 py-16">
        <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
      </div>
    );

  const fi = data.fullInfo || {};

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
      data-testid="fullinfo-edit-form"
    >
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={() => nav(`/students/${id}/full-information`)}
            className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            تعديل المعلومات الكاملة
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            تحديث الحقول التفصيلية للسجل الشامل — {data.student?.fullName}
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          data-testid="fullinfo-save-btn"
          className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60"
        >
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>

      <Section title="حقول السجل التفصيلي (Excel)">
        <p className="text-xs text-gray-500 mb-2">
          للحقول الأساسية للطالب (الاسم، الجنس، تاريخ الميلاد ...) استخدم صفحة
          تعديل الطالب العادية.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FULL_INFO_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                data-testid={`fi-${k}`}
                className={inputCls}
                value={fi[k] || ""}
                onChange={(e) => updateFI(k, e.target.value)}
              />
            </Field>
          ))}
          <Field label="أبناء كادر">
            <div className="flex items-center gap-6 pt-2">
              <Radio
                name="staffChildren"
                checked={!fi.staffChildren}
                onChange={() => updateFI("staffChildren", false)}
                label="لا"
              />
              <Radio
                name="staffChildren"
                checked={!!fi.staffChildren}
                onChange={() => updateFI("staffChildren", true)}
                label="نعم"
              />
            </div>
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2 sticky bottom-4 z-10">
        <button
          type="button"
          onClick={() => nav(`/students/${id}/full-information`)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60 shadow-sm"
        >
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
    </form>
  );
}
