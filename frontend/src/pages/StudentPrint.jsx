import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { STATUS_LABELS, GENDER_LABELS, ORPHAN_OF_LABELS } from "@/lib/studentDefaults";

const Section = ({ title, children }) => (
  <div className="print-card border border-gray-300 rounded-md p-3 mb-3">
    <div className="text-[11px] uppercase font-bold text-gray-700 border-b border-gray-300 pb-1 mb-2">{title}</div>
    <div className="text-[12px] text-gray-900">{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex gap-2 py-0.5">
    <div className="text-gray-600 min-w-[140px]">{label}:</div>
    <div className="font-medium flex-1 break-words">{value || "—"}</div>
  </div>
);

export default function StudentPrint() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/students/${id}`).then((r) => setData(r.data));
  }, [id]);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (!data) return <div className="p-6 text-gray-500">جاري التحضير للطباعة...</div>;

  const s = data.student || {};
  const f = data.father || {};
  const m = data.mother || {};

  return (
    <div className="bg-white min-h-screen" dir="rtl">
      <div className="max-w-[210mm] mx-auto p-8 print-area">
        {/* Header */}
        <div className="flex items-center gap-4 border-b-2 border-[#04CDF9] pb-3 mb-4">
          <img src="/assets/logo.png" alt="IQRA" className="h-16 w-16 object-contain" />
          <div className="flex-1">
            <div className="text-xl font-extrabold text-gray-900">مدرسة اقرأ</div>
            <div className="text-sm text-gray-600">استمارة تسجيل طالب</div>
          </div>
          <div className="text-xs text-gray-600">تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}</div>
        </div>

        <div className="no-print flex items-center justify-end gap-2 mb-3">
          <button onClick={() => window.print()} className="rounded-lg bg-[#04CDF9] text-white px-4 py-2 text-sm">طباعة</button>
          <button onClick={() => window.close()} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm">إغلاق</button>
        </div>

        <Section title="معلومات الطالب">
          <div className="grid grid-cols-2 gap-x-4">
            <Row label="الاسم الكامل" value={s.fullName} />
            <Row label="تاريخ الميلاد" value={s.birthdate?.slice(0, 10)} />
            <Row label="مكان الميلاد" value={s.birthPlace} />
            <Row label="الجنس" value={GENDER_LABELS[s.gender]} />
            <Row label="الصف السابق" value={s.previousClass} />
            <Row label="الصف الجديد" value={s.newClass} />
            <Row label="الوضع" value={STATUS_LABELS[s.status]} />
            <Row label="يتيم" value={s.orphan ? `نعم - ${ORPHAN_OF_LABELS[s.orphanOf] || ""}` : "لا"} />
            <Row label="العنوان الحالي" value={s.currentAddress} />
            <Row label="اللغات" value={(s.languages || []).join("، ")} />
            <Row label="الهوايات" value={(s.hobbies || []).join("، ")} />
            <Row label="رموز العنوان" value={
              Object.entries(s.addressCodes || {})
                .map(([k, v]) => v ? `${{sector:"قطاع",block:"مجمع",minutes:"دقائق",floor:"طابق",apartment:"شقة"}[k]}: ${v}` : null)
                .filter(Boolean).join(" • ")
            } />
            <Row label="أمراض مزمنة" value={s.chronicDisease ? s.chronicDiseaseDetails || "نعم" : "لا"} />
            <Row label="عادات دائمة" value={s.permanentHabits ? s.permanentHabitsDetails || "نعم" : "لا"} />
          </div>
        </Section>

        {data.siblings?.length > 0 && (
          <Section title="الإخوة">
            <table className="w-full text-[12px] border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-2 py-1 text-right">#</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">الاسم الكامل</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">الجنس</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">الصف</th>
                </tr>
              </thead>
              <tbody>
                {data.siblings.map((sib, i) => (
                  <tr key={i}>
                    <td className="border border-gray-300 px-2 py-1">{sib.order}</td>
                    <td className="border border-gray-300 px-2 py-1">{sib.fullName}</td>
                    <td className="border border-gray-300 px-2 py-1">{GENDER_LABELS[sib.gender]}</td>
                    <td className="border border-gray-300 px-2 py-1">{sib.class}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Section title="الأب">
            <Row label="الاسم" value={f.name} />
            <Row label="الحالة" value={f.alive ? "على قيد الحياة" : "متوفى"} />
            <Row label="الهاتف" value={f.phone} />
            <Row label="العنوان" value={f.address} />
            <Row label="المهنة" value={f.profession} />
            <Row label="واتساب" value={f.whatsapp} />
            <Row label="تلغرام" value={f.telegram} />
          </Section>
          <Section title="الأم">
            <Row label="الاسم" value={m.name} />
            <Row label="الحالة" value={m.alive ? "على قيد الحياة" : "متوفى"} />
            <Row label="الهاتف" value={m.phone} />
            <Row label="العنوان" value={m.address} />
            <Row label="المهنة" value={m.profession} />
            <Row label="واتساب" value={m.whatsapp} />
            <Row label="تلغرام" value={m.telegram} />
          </Section>
        </div>

        <Section title="معلومات عامة">
          <Row label="واتساب المدرسة" value={data.general?.whatsappGroupPhone} />
          <Row label="جهة الطوارئ" value={
            [data.general?.emergencyContact?.name, data.general?.emergencyContact?.relation, data.general?.emergencyContact?.phone].filter(Boolean).join(" • ")
          } />
        </Section>

        {data.previousEducation?.length > 0 && (
          <Section title="التعليم السابق">
            <table className="w-full text-[12px] border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-300 px-2 py-1 text-right">الصفوف</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">المدرسة</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">البدء</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">الانتهاء</th>
                  <th className="border border-gray-300 px-2 py-1 text-right">النتائج</th>
                </tr>
              </thead>
              <tbody>
                {data.previousEducation.map((e, i) => (
                  <tr key={i}>
                    <td className="border border-gray-300 px-2 py-1">{e.classes}</td>
                    <td className="border border-gray-300 px-2 py-1">{e.schoolName}</td>
                    <td className="border border-gray-300 px-2 py-1">{e.startingDate}</td>
                    <td className="border border-gray-300 px-2 py-1">{e.endingDate}</td>
                    <td className="border border-gray-300 px-2 py-1">{e.results}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {data.islamicLegalEducation && (
          <Section title="التعليم الشرعي">
            <p className="whitespace-pre-wrap">{data.islamicLegalEducation}</p>
          </Section>
        )}

        {data.bestAchievement && (
          <Section title="أفضل إنجاز">
            <p className="whitespace-pre-wrap">{data.bestAchievement}</p>
          </Section>
        )}

        <Section title="معلومات أخرى">
          <Row label="مدخنون في الأسرة" value={data.otherInfo?.familySmokers ? "نعم" : "لا"} />
          <Row label="طريقة الوصول للمدرسة" value={data.otherInfo?.transportation} />
        </Section>

        {/* Signing */}
        <div className="print-card border border-gray-300 rounded-md p-4 mt-3">
          <div className="text-[11px] uppercase font-bold text-gray-700 border-b border-gray-300 pb-1 mb-2">التوقيع</div>
          <p className="text-[12px] leading-relaxed mb-2">
            أتعهد أنا ولي أمر الطالب / ابني (في حال قبوله في المدرسة) بالالتزام بأنظمة ولوائح المدرسة المرفقة بهذه الاستمارة.
          </p>
          <p className="text-[12px] leading-relaxed mb-4">
            بتوقيعي هنا، أعتبر نفسي مسؤولاً عن صحة المعلومات المذكورة أعلاه. وفي حال ثبوت عدم صحتها، أتحمل المسؤولية وأوافق على القرار الذي تتخذه إدارة المدرسة.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Row label="اسم ولي الأمر" value={data.signing?.parentName} />
            <Row label="صلة القرابة" value={data.signing?.relationToStudent} />
          </div>
          <div className="mt-6">
            <div className="text-[12px] text-gray-600 mb-8">التوقيع:</div>
            <div className="border-b border-gray-500 h-14"></div>
          </div>
        </div>

        <div className="text-center text-[10px] text-gray-500 mt-4">
          مدرسة اقرأ — نظام تسجيل الطلاب
        </div>
      </div>
    </div>
  );
}
