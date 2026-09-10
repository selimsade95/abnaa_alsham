import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import api, { API } from "@/lib/api";
import {
  Loader2,
  Printer,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
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
            width: 180,
            margin: 0,
            errorCorrectionLevel: "M",
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          }),
        );
      })
      .catch(() => toast.error("تعذر تحميل بطاقة الطالب"));
  }, [id]);

  if (!data || !qr)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-500" />
        <span className="text-sm font-medium">جاري تحميل البطاقة...</span>
      </div>
    );

  const student = data.student || {};
  const isActive = student.status !== "inactive";
  const className = data.currentClass?.name || student.newClass || "—";

  return (
    <div
      className="min-h-screen bg-slate-100 p-4 sm:p-8 flex flex-col items-center justify-center print:bg-white print:p-0"
      dir="rtl"
    >
      {/* Alert bar for inactive student */}
      {!isActive && data.deactivationReason && (
        <div
          className="no-print mb-4 w-full max-w-[336px] rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 shadow-sm"
          role="alert"
        >
          <span className="font-bold">الطالب غير نشط:</span>{" "}
          {data.deactivationReason}
        </div>
      )}

      {/* Action Controls */}
      <div className="no-print mb-4 flex w-full max-w-[336px] items-center justify-between px-1">
        <button
          onClick={() => window.close()}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="h-4 w-4" /> إغلاق
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-cyan-700 transition-colors"
        >
          <Printer className="h-3.5 w-3.5" /> طباعة
        </button>
      </div>

      {/* Compact ID Card Container (Standard Pocket Size Ratio) */}
      <main className="student-card relative w-[336px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5 print:shadow-none print:ring-0">
        {/* Top Decorative Gradient Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500" />

        {/* Header Header */}
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <img
            src="/assets/logo.png"
            alt="مؤسسة اقرأ"
            className="h-7 w-7 object-contain"
          />
          <div className="text-center">
            <h1 className="text-xs font-black text-slate-800 tracking-tight">
              مدرسة أبناء الشام
            </h1>
            <p className="text-[9px] font-medium text-cyan-600">
              بطاقة طالب معتمدة
            </p>
          </div>
          <img
            src="/assets/school_logo.png"
            alt="مدرسة أبناء الشام"
            className="h-7 w-7 object-contain"
          />
        </header>

        {/* Main Body */}
        <section className="p-4">
          {/* Identity Header: Photo + Name + Status */}
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              <img
                src={`${API}/public/students/${id}/validation/personal-photo`}
                alt="صورة الطالب"
                className="h-20 w-16 rounded-xl border border-slate-200 bg-slate-100 object-cover shadow-sm"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <span
                className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white ${
                  isActive ? "bg-emerald-500" : "bg-red-500"
                }`}
                title={isActive ? "نشط" : "غير نشط"}
              >
                {isActive ? (
                  <UserCheck className="h-3 w-3" />
                ) : (
                  <UserX className="h-3 w-3" />
                )}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-extrabold text-slate-900 leading-snug">
                {student.fullName || "—"}
              </h2>
              <div className="mt-0.5 inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider text-slate-600">
                #{data.code || "—"}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
                <ShieldCheck className="h-3 w-3 text-cyan-600" />
                <span>
                  {STATUS_LABELS[student.status] ||
                    (isActive ? "نشط" : "غير نشط")}
                </span>
              </div>
            </div>
          </div>

          {/* Academic Metadata Grid */}
          <div className="mt-3.5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-50 p-2 text-right border border-slate-100">
            <div className="px-1.5 py-1">
              <span className="block text-[9px] font-medium text-slate-400">
                الصف
              </span>
              <span className="block truncate text-xs font-bold text-slate-700">
                {className}
              </span>
            </div>
            <div className="px-1.5 py-1">
              <span className="block text-[9px] font-medium text-slate-400">
                الشعبة
              </span>
              <span className="block truncate text-xs font-bold text-slate-700">
                {data.currentClass?.section || "—"}
              </span>
            </div>
            <div className="px-1.5 py-1">
              <span className="block text-[9px] font-medium text-slate-400">
                مسار التسجيل
              </span>
              <span className="block truncate text-xs font-bold text-slate-700">
                {data.student?.registrationPath || "—"}
              </span>
            </div>
            <div className="px-1.5 py-1">
              <span className="block text-[9px] font-medium text-slate-400">
                حالة القيد
              </span>
              <span
                className={`block truncate text-xs font-bold ${isActive ? "text-emerald-600" : "text-red-600"}`}
              >
                {isActive ? "منتظم" : "موقوف"}
              </span>
            </div>
          </div>

          {/* Footer Validation Area */}
          <div className="mt-3.5 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
            <div className="flex flex-col justify-center">
              <p className="text-[10px] font-bold text-slate-700">
                التحقق الرقمي
              </p>
              <p className="mt-0.5 text-[9px] text-slate-400 max-w-[150px] leading-tight">
                امسح الرمز ضوئياً للتحقق المباشر من صحة البيانات
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-1 bg-white shadow-2xs">
              <img
                src={qr}
                alt="رمز التحقق"
                className="h-12 w-12 object-contain"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
