import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import api from "@/lib/api";
import { Loader2, Printer, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/lib/studentDefaults";

export default function StudentCard() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    api
      .get(`/students/${id}`)
      .then(async (response) => {
        setData(response.data);
        const url = `${window.location.origin}/validate/student/${id}`;
        setQr(
          await QRCode.toDataURL(url, {
            width: 220,
            margin: 1,
            errorCorrectionLevel: "M",
          }),
        );
      })
      .catch(() => toast.error("تعذر تحميل بطاقة الطالب"));
  }, [id]);

  if (!data || !qr)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري التحميل...
      </div>
    );

  const student = data.student || {};
  const isActive = student.status !== "inactive";
  const className = data.currentClass?.name || student.newClass || "—";

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8" dir="rtl">
      {!isActive && data.deactivationReason && (
        <div
          className="no-print mx-auto mb-4 max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <span className="font-bold">الطالب غير نشط.</span> سبب التعطيل:{" "}
          {data.deactivationReason}
        </div>
      )}
      <div className="no-print max-w-md mx-auto mb-4 flex items-center justify-between">
        <button
          onClick={() => window.close()}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowRight className="h-4 w-4" /> إغلاق
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
        >
          <Printer className="h-4 w-4" /> طباعة البطاقة
        </button>
      </div>

      <main className="student-card mx-auto max-w-md overflow-hidden rounded-2xl border border-[#BDEFFA] bg-white shadow-lg">
        <header className="bg-[#E0F9FF] px-6 py-5 flex items-center gap-3 border-b-2 border-[#04CDF9]">
          <div className="flex items-center justify-between w-[100%]">
            <img
              src="/assets/logo.png"
              alt="مؤسسة اقرأ"
              className="h-14 w-14 object-contain"
            />
            <div>
              <div className="text-xl font-extrabold text-gray-900">
                مدرسة أبناء الشام
              </div>
              <div className="text-xs text-center text-[#036A87]">
                بطاقة طالب رقمية
              </div>
            </div>
            <img
              src="/assets/school_logo.png"
              alt="مدرسة أبناء الشام"
              className="h-14 w-14 object-contain"
            />
          </div>
        </header>
        <section className="p-6 text-center">
          <div
            className={`mx-auto mb-4 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            {isActive ? "طالب نشط" : "طالب غير نشط"}
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {student.fullName || "—"}
          </h1>
          <div className="mt-1 font-mono text-sm text-[#036A87]">
            {data.code || "—"}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-right">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">الصف</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {className}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">الشعبة</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {data.currentClass?.section || "—"}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">الحالة</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {STATUS_LABELS[student.status] ||
                  (isActive ? "نشط" : "غير نشط")}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">مسار التسجيل</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {data.student.registrationPath || "—"}
              </div>
            </div>
            {/* <div className="col-span-2 rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">الحالة</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {STATUS_LABELS[student.status] ||
                  (isActive ? "نشط" : "غير نشط")}
              </div>
            </div> */}
          </div>
          <div className="mt-6 flex flex-col items-center border-t border-gray-100 pt-5">
            <img
              src={qr}
              alt="رمز التحقق من بيانات الطالب"
              className="h-44 w-44"
            />
            <p className="mt-2 text-xs text-gray-500">
              امسح الرمز للتحقق من بيانات الطالب
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
