import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, Pencil, Trash2, Printer, Loader2 } from "lucide-react";
import { STATUS_LABELS, GENDER_LABELS, ORPHAN_OF_LABELS } from "@/lib/studentDefaults";

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">{title}</h3>
    <div>{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex flex-wrap gap-2 py-1.5">
    <div className="text-sm text-gray-500 w-40">{label}</div>
    <div className="text-sm text-gray-900 font-medium flex-1 min-w-0 break-words">{value || <span className="text-gray-400">—</span>}</div>
  </div>
);

export default function StudentView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    api.get(`/students/${id}`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("تعذر تحميل بيانات الطالب"))
      .finally(() => setLoading(false));
  }, [id]);

  const doDelete = async () => {
    try {
      await api.delete(`/students/${id}`);
      toast.success("تم حذف الطالب");
      nav("/students");
    } catch {
      toast.error("تعذر حذف الطالب");
    }
  };

  if (loading) return <div className="text-center text-gray-500 py-16"><Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...</div>;
  if (!data) return null;

  const s = data.student || {};
  const f = data.father || {};
  const m = data.mother || {};

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => nav("/students")} className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2">
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{s.fullName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {GENDER_LABELS[s.gender]} • {STATUS_LABELS[s.status]} • الصف الجديد: {s.newClass || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.open(`/students/${id}/print`, "_blank")} data-testid="view-print-btn" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button onClick={() => nav(`/students/${id}/edit`)} data-testid="view-edit-btn" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Pencil className="h-4 w-4" /> تعديل
          </button>
          <button onClick={() => setConfirm(true)} data-testid="view-delete-btn" className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm hover:bg-red-100">
            <Trash2 className="h-4 w-4" /> حذف
          </button>
        </div>
      </div>

      <Section title="معلومات الطالب">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Row label="الاسم الكامل" value={s.fullName} />
          <Row label="تاريخ الميلاد" value={s.birthdate?.slice(0, 10)} />
          <Row label="مكان الميلاد" value={s.birthPlace} />
          <Row label="الجنس" value={GENDER_LABELS[s.gender]} />
          <Row label="الصف السابق" value={s.previousClass} />
          <Row label="الصف الجديد" value={s.newClass} />
          <Row label="الوضع" value={STATUS_LABELS[s.status]} />
          <Row label="يتيم" value={s.orphan ? `نعم — ${ORPHAN_OF_LABELS[s.orphanOf] || "—"}` : "لا"} />
          <Row label="العنوان الحالي" value={s.currentAddress} />
          <Row label="اللغات" value={(s.languages || []).join("، ")} />
          <Row label="الهوايات" value={(s.hobbies || []).join("، ")} />
          <Row label="رموز العنوان" value={
            Object.entries(s.addressCodes || {})
              .map(([k, v]) => v ? `${{sector:"القطاع",block:"المجمع",minutes:"الدقائق",floor:"الطابق",apartment:"الشقة"}[k]}: ${v}` : null)
              .filter(Boolean).join(" • ")
          } />
          <Row label="أمراض مزمنة" value={s.chronicDisease ? s.chronicDiseaseDetails || "نعم" : "لا"} />
          <Row label="عادات دائمة" value={s.permanentHabits ? s.permanentHabitsDetails || "نعم" : "لا"} />
        </div>
      </Section>

      <Section title="الإخوة">
        {data.siblings?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">#</th>
                  <th className="px-3 py-2 text-right font-medium">الاسم الكامل</th>
                  <th className="px-3 py-2 text-right font-medium">الجنس</th>
                  <th className="px-3 py-2 text-right font-medium">الصف</th>
                </tr>
              </thead>
              <tbody>
                {data.siblings.map((sib, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600">{sib.order}</td>
                    <td className="px-3 py-2 text-gray-900">{sib.fullName}</td>
                    <td className="px-3 py-2 text-gray-600">{GENDER_LABELS[sib.gender]}</td>
                    <td className="px-3 py-2 text-gray-600">{sib.class}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (<p className="text-sm text-gray-500">لا يوجد إخوة مسجلون.</p>)}
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

      <Section title="التعليم السابق">
        {data.previousEducation?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">الصفوف</th>
                  <th className="px-3 py-2 text-right font-medium">اسم المدرسة</th>
                  <th className="px-3 py-2 text-right font-medium">البدء</th>
                  <th className="px-3 py-2 text-right font-medium">الانتهاء</th>
                  <th className="px-3 py-2 text-right font-medium">النتائج</th>
                </tr>
              </thead>
              <tbody>
                {data.previousEducation.map((e, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2">{e.classes}</td>
                    <td className="px-3 py-2">{e.schoolName}</td>
                    <td className="px-3 py-2">{e.startingDate}</td>
                    <td className="px-3 py-2">{e.endingDate}</td>
                    <td className="px-3 py-2">{e.results}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (<p className="text-sm text-gray-500">لا توجد سجلات.</p>)}
      </Section>

      <Section title="التعليم الشرعي">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{data.islamicLegalEducation || "—"}</p>
      </Section>

      <Section title="أفضل إنجاز">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{data.bestAchievement || "—"}</p>
      </Section>

      <Section title="معلومات أخرى">
        <Row label="مدخنون في الأسرة" value={data.otherInfo?.familySmokers ? "نعم" : "لا"} />
        <Row label="طريقة الوصول للمدرسة" value={data.otherInfo?.transportation} />
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-medium text-amber-800 mb-1">ملاحظات داخلية (لن تُطبع)</div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">{data.otherInfo?.notes || "لا توجد ملاحظات."}</p>
        </div>
      </Section>

      <Section title="التوقيع">
        <Row label="اسم ولي الأمر" value={data.signing?.parentName} />
        <Row label="صلة القرابة" value={data.signing?.relationToStudent} />
      </Section>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-gray-600 mb-6">هل أنت متأكد من حذف هذا الطالب؟ لا يمكن التراجع.</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirm(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
              <button onClick={doDelete} data-testid="view-confirm-delete-btn" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
