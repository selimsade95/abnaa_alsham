import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { API } from "@/lib/api";
import { useStudent } from "@/hooks/useStudent";
import { Loader2, Printer, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function StudentCard() {
  const { id } = useParams();
  const { student: data } = useStudent(id);
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (data) {
      (async () => {
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
      })().catch(() => toast.error("تعذر تحميل بطاقة الطالب"));
    }
  }, [data, id]);

  if (!data || !qr)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-500" />
        <span className="text-sm font-medium">جاري تحميل البطاقة...</span>
      </div>
    );

  const student = data.student || {};
  const className = data.currentClass?.name || student.newClass || "-";
  const isFemale = student.gender === "female";
  const cardBackground = isFemale
    ? "/assets/card-female.png"
    : "/assets/card-male.png";

  return (
    <div
      className="min-h-screen bg-slate-100 p-4 sm:p-8 flex flex-col items-center justify-center print:bg-white print:p-0"
      dir="rtl"
    >
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

      <main className="student-card student-card--background">
        <img
          src={cardBackground}
          alt=""
          aria-hidden="true"
          className="student-card__artwork"
        />
        <img
          src={`${API}/public/students/${id}/validation/personal-photo`}
          alt="صورة الطالب"
          className="student-card__photo"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />

        <div className="student-card__data student-card__data--name">
          {student.fullName || "-"}
        </div>
        <div className="student-card__data student-card__data--class">
          {className}
        </div>
        <div className="student-card__data student-card__data--section">
          {data.currentClass?.section || "-"}
        </div>
        <div className="student-card__data student-card__data--bus">
          {student.busNumber || "-"}
        </div>
        <div className="student-card__data student-card__data--phone">
          {student.phone || "-"}
        </div>

        <img src={qr} alt="رمز التحقق" className="student-card__qr" />
        <span className="student-card__code">{data.code || "—"}</span>
      </main>
    </div>
  );
}
