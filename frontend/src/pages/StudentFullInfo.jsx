import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { ArrowRight, Loader2, Pencil } from "lucide-react";
import { STATUS_LABELS, GENDER_LABELS, ORPHAN_OF_LABELS } from "@/lib/studentDefaults";
import { useAuth } from "@/lib/auth";

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">{title}</h3>
    <div>{children}</div>
  </div>
);
const Row = ({ label, value }) => (
  <div className="flex flex-wrap gap-2 py-1.5">
    <div className="text-sm text-gray-500 w-56">{label}</div>
    <div className="text-sm text-gray-900 font-medium flex-1 min-w-0 break-words">{value || <span className="text-gray-400">—</span>}</div>
  </div>
);

export default function StudentFullInfo() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/students/${id}/full-information`).then((r) => setData(r.data))
      .catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center text-gray-500 py-16"><Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...</div>;
  if (!data) return <div className="text-center text-gray-500 py-16">لا توجد بيانات.</div>;

  const s = data.student || {};
  const fi = data.fullInfo || {};
  const f = data.father || {};
  const m = data.mother || {};

  return (
    <div className="space-y-6" data-testid="full-info-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => nav(`/students/${id}`)} className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2"><ArrowRight className="h-4 w-4" /> رجوع</button>
          <h1 className="text-3xl font-bold text-gray-900">{s.fullName}</h1>
          <p className="text-sm text-gray-500 mt-1">المعلومات الكاملة • كود الطالب: <span className="font-mono">{data.code || "—"}</span></p>
        </div>
        {has("students.update") && (
          <button onClick={() => nav(`/students/${id}/full-information/edit`)} data-testid="fullinfo-edit-btn" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><Pencil className="h-4 w-4" /> تعديل المعلومات الكاملة</button>
        )}
      </div>

      <Section title="بيانات الطالب الأساسية">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Row label="م" value={fi.serial} />
          <Row label="تسلسل صفي" value={fi.classSerial} />
          <Row label="الصف - الشعبة" value={data.currentClass ? `${data.currentClass.grade || ""} — ${data.currentClass.section || ""}` : fi.classSection} />
          <Row label="م2" value={fi.serial2} />
          <Row label="القسم" value={fi.department} />
          <Row label="رقم السجل العام" value={fi.generalRegNumber} />
          <Row label="الرقم الوزاري" value={fi.ministerialNumber} />
          <Row label="كود الطالب" value={data.code} />
          <Row label="الاسم" value={s.fullName} />
          <Row label="الأب" value={f.name || fi.fatherFirstName} />
          <Row label="النسبة" value={fi.familyName} />
          <Row label="الاسم الثاني" value={fi.secondName} />
          <Row label="الاسم الثلاثي" value={fi.tripleName} />
          <Row label="اسم الأم الثلاثي" value={fi.motherTripleName} />
          <Row label="اسم الجد" value={fi.grandfatherName} />
          <Row label="مكان الميلاد" value={s.birthPlace} />
          <Row label="تاريخ الميلاد" value={s.birthdate?.slice(0, 10)} />
          <Row label="عمره بالسنوات" value={fi.ageYears} />
          <Row label="الجنس" value={GENDER_LABELS[s.gender]} />
          <Row label="الجنسية" value={fi.nationality} />
          <Row label="حالة الطالب" value={STATUS_LABELS[s.status]} />
          <Row label="حالة الطالب الأسرية" value={fi.familyStatus} />
          <Row label="لغة الطالب" value={fi.primaryLanguage} />
          <Row label="لغات يتقنها" value={(s.languages || []).join("، ")} />
          <Row label="علامات مميزة" value={fi.distinctiveMarks} />
          <Row label="عادات دائمة" value={s.permanentHabits ? s.permanentHabitsDetails || "نعم" : "لا"} />
          <Row label="أمراض مزمنة" value={s.chronicDisease ? "نعم" : "لا"} />
          <Row label="نوع المرض المزمن" value={s.chronicDiseaseDetails} />
          <Row label="زمرة دم الطالب" value={fi.bloodType} />
          <Row label="هوايات الطالب" value={(s.hobbies || []).join("، ")} />
          <Row label="التحصيل الشرعي" value={data.islamicLegalEducation} />
          <Row label="طريقة الحضور للمدرسة" value={data.otherInfo?.transportation} />
          <Row label="عدد أفراد العائلة" value={fi.familySize} />
          <Row label="عدد الإخوة في المدرسة" value={fi.siblingsInSchool} />
        </div>
      </Section>

      <Section title="الأسرة والإخوة">
        {(data.siblings || []).length > 0 ? (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="px-3 py-2 text-right">#</th><th className="px-3 py-2 text-right">الاسم</th><th className="px-3 py-2 text-right">الجنس</th><th className="px-3 py-2 text-right">الصف</th></tr></thead>
            <tbody>{data.siblings.map((sib, i) => (
              <tr key={i} className="border-t border-gray-100"><td className="px-3 py-2 text-gray-600">{sib.order}</td><td className="px-3 py-2 text-gray-900">{sib.fullName}</td><td className="px-3 py-2 text-gray-600">{GENDER_LABELS[sib.gender]}</td><td className="px-3 py-2 text-gray-600">{sib.class}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="text-sm text-gray-500">لا يوجد إخوة مسجلون.</p>}
        <div className="mt-3"><Row label="مع من يسكن الطالب" value={fi.livesWith} /></div>
      </Section>

      <Section title="بيانات السكن">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Row label="المحافظة" value={fi.housingGovernorate} />
          <Row label="المنطقة" value={fi.housingRegion} />
          <Row label="الناحية" value={fi.housingDistrict} />
          <Row label="البلدة" value={fi.housingTown} />
          <Row label="القطاع" value={s.addressCodes?.sector} />
          <Row label="الكتلة" value={s.addressCodes?.block} />
          <Row label="الطابق" value={s.addressCodes?.floor} />
          <Row label="رقم الشقة" value={s.addressCodes?.apartment} />
          <Row label="رقم المحضر" value={fi.recordNumber} />
          <Row label="نوع المسكن" value={fi.housingType} />
          <Row label="ملكية السكن" value={fi.housingOwnership} />
          <Row label="العنوان الحالي" value={s.currentAddress} />
        </div>
      </Section>

      <Section title="بيانات والدي الطالب">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">الأب</h4>
            <Row label="اسم الأب" value={f.name} />
            <Row label="حالة الأب" value={f.alive ? "على قيد الحياة" : "متوفى"} />
            <Row label="الحالة الاجتماعية" value={fi.fatherMaritalStatus} />
            <Row label="مهنة الأب" value={f.profession} />
            <Row label="اختصاص الأب" value={fi.fatherSpecialty} />
            <Row label="رقم التواصل" value={f.phone} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">الأم</h4>
            <Row label="اسم الأم" value={m.name} />
            <Row label="حالة الأم" value={m.alive ? "على قيد الحياة" : "متوفى"} />
            <Row label="الحالة الاجتماعية" value={fi.motherMaritalStatus} />
            <Row label="عنوان الأم" value={m.address} />
            <Row label="مهنة الأم" value={m.profession} />
            <Row label="اختصاص الأم" value={fi.motherSpecialty} />
            <Row label="رقم التواصل" value={m.phone} />
          </div>
        </div>
      </Section>

      <Section title="بيانات القيد">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Row label="المحافظة الأصلية" value={fi.originalGovernorate} />
          <Row label="الأمانة" value={fi.registrationAmana} />
          <Row label="مكان القيد" value={fi.registrationPlace} />
          <Row label="رقم القيد" value={fi.registrationNumber} />
          <Row label="مسار التسجيل" value={s.registrationPath} />
          <Row label="كود الطالب" value={data.code} />
        </div>
      </Section>

      <Section title="بيانات القيد المدرسي">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Row label="تاريخ الالتحاق بالمدرسة" value={fi.enrollmentDate} />
          <Row label="صف الالتحاق" value={fi.enrollmentClass} />
          <Row label="الصف الحالي" value={data.currentClass?.name || s.newClass} />
          <Row label="الشعبة" value={data.currentClass?.section} />
          <Row label="الفرع" value={fi.branch} />
          <Row label="الصف2" value={fi.class2} />
        </div>
      </Section>

      <Section title="المدارس والمراكز السابقة">
        {(data.previousEducation || []).length > 0 ? (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="px-3 py-2 text-right">الصف2</th><th className="px-3 py-2 text-right">اسم المدرسة</th><th className="px-3 py-2 text-right">اسم المركز</th><th className="px-3 py-2 text-right">البدء</th><th className="px-3 py-2 text-right">الانتهاء</th><th className="px-3 py-2 text-right">النتائج</th></tr></thead>
            <tbody>{data.previousEducation.map((e, i) => (
              <tr key={i} className="border-t border-gray-100"><td className="px-3 py-2">{e.classes}</td><td className="px-3 py-2">{e.schoolName}</td><td className="px-3 py-2">{e.centerName}</td><td className="px-3 py-2">{e.startingDate}</td><td className="px-3 py-2">{e.endingDate}</td><td className="px-3 py-2">{e.results}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="text-sm text-gray-500">لا توجد سجلات.</p>}
      </Section>

      <Section title="المظهر العام للطالب">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6">
          <Row label="قياس الطول" value={fi.height} />
          <Row label="قياس العرض" value={fi.width} />
          <Row label="قياس القدم" value={fi.footSize} />
          <Row label="قياس الثوب" value={fi.uniformSize} />
          <Row label="الوزن" value={fi.weight} />
        </div>
      </Section>

      <Section title="حالة الطوارئ">
        <Row label="رقم التواصل" value={data.general?.emergencyContact?.phone} />
        <Row label="اسم مالك الرقم" value={data.general?.emergencyContact?.name} />
        <Row label="علاقة مالك الرقم بالطالب" value={data.general?.emergencyContact?.relation} />
      </Section>

      <Section title="معلومات أخرى">
        <Row label="يتيم" value={s.orphan ? `نعم — ${ORPHAN_OF_LABELS[s.orphanOf] || "—"}` : "لا"} />
        {s.orphan && <Row label="نوع وثيقة اليتم" value={s.orphanDocType} />}
        <Row label="مدخنون في الأسرة" value={data.otherInfo?.familySmokers ? "نعم" : "لا"} />
        <Row label="أبناء كادر" value={fi.staffChildren ? "نعم" : "لا"} />
        <Row label="أفضل إنجاز" value={data.bestAchievement} />
      </Section>
    </div>
  );
}
