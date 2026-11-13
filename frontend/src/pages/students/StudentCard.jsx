import WhatsAppPhone from "@/components/WhatsAppPhone";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import api from "@/lib/api";
import { useStudent } from "@/hooks/useStudent";
import { Loader2, Printer, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { getLanguage } from "@/i18n";
import { useAuth } from "@/lib/auth";
import ConfirmAction from "@/components/ConfirmAction";

export default function StudentCard() {
  const { id } = useParams();
  const { student: data } = useStudent(id);
  const { has } = useAuth();
  const canManageAccess = has("students.parentAccess.manage");
  const canViewPhoto = has("students.documents.view");
  const [photo, setPhoto] = useState(null);
  const hasPhoto = Boolean(data?.documents?.personal_photo);

  useEffect(() => {
    if (!canViewPhoto || !hasPhoto) return;
    const controller = new AbortController();
    let url;
    api.get(`/students/${id}/documents/personal_photo`, {
      responseType: "blob", signal: controller.signal,
    }).then(({ data: image }) => {
      if (!controller.signal.aborted) {
        url = URL.createObjectURL(image);
        setPhoto({ id, url });
      }
    }).catch(() => {});
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, canViewPhoto, hasPhoto]);

  const [card, setCard] = useState(null);
  const [issuedAt, setIssuedAt] = useState(null);
  const [statusReady, setStatusReady] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    if (!canManageAccess) return;
    const controller = new AbortController();
    api.get(`/students/${id}/parent-access`, { signal: controller.signal }).then(({ data }) => {
      setIssuedAt(data.issuedAt);
      setStatusReady(true);
    }).catch(() => {
      if (!controller.signal.aborted) toast.error("تعذر تحميل حالة دخول ولي الأمر");
    });
    return () => controller.abort();
  }, [id, canManageAccess]);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(card ? "/parent-access" : `/validate/student/${id}`, window.location.origin);
    if (card) url.hash = new URLSearchParams({ access: card.accessCode.replaceAll("-", "") }).toString();
    QRCode.toDataURL(url.href, { width: 320, margin: 4, errorCorrectionLevel: "M" })
      .then((image) => { if (!cancelled) setQr(image); })
      .catch(() => {
        if (!cancelled) {
          setQrFailed(true);
          toast.error("تعذر إنشاء رمز الاستجابة السريعة");
        }
      });
    return () => { cancelled = true; };
  }, [id, card]);

  const changeAccess = async (revoke) => {
    setBusy(true);
    try {
      const endpoint = `/students/${id}/parent-access`;
      let nextCard = null;
      if (revoke) await api.delete(endpoint);
      else nextCard = (await api.post(endpoint)).data;
      if (card !== nextCard) {
        setQr("");
        setQrFailed(false);
      }
      setIssuedAt(nextCard?.issuedAt || null);
      setCard(nextCard);
    } catch {
      toast.error("تعذر تحديث دخول ولي الأمر");
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-accent-foreground" />
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
      className="min-h-screen bg-secondary p-4 sm:p-8 flex flex-col items-center justify-center print:bg-card print:p-0"
      dir={getLanguage() === "ar" ? "rtl" : "ltr"}
    >
      {/* Action Controls */}
      <div className="no-print mb-4 flex w-full max-w-[336px] items-center justify-between px-1">
        <button
          onClick={() => window.close()}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-4 w-4" /> إغلاق
        </button>
        <button
          onClick={() => window.print()}
          disabled={busy || (!qr && !(card && qrFailed))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-hover transition-colors"
        >
          <Printer className="h-3.5 w-3.5" /> طباعة
        </button>
      </div>

      <ConfirmAction action={pendingAction} onClose={() => setPendingAction(null)} />
      {canManageAccess && (
        <section className="no-print mb-4 w-full max-w-md rounded-lg border bg-card p-4">
          <h2 className="font-semibold">دخول ولي الأمر على بطاقة الطالب</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {card ? "اطبع البطاقة الآن لتسليمها لولي الأمر." : "تحقق من هوية ولي الأمر قبل تفعيل الدخول وتسليم البطاقة."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!card && student.status !== "inactive" && data.code && (
              <button type="button" disabled={busy || !statusReady}
                onClick={() => setPendingAction({
                  title: issuedAt ? "استبدال رمز الدخول" : "تفعيل دخول ولي الأمر",
                  description: issuedAt
                    ? "تحقق من هوية ولي الأمر. الرمز الجديد يلغي الدخول من البطاقة السابقة."
                    : "هل تحققت من هوية ولي الأمر قبل تسليمه البطاقة؟",
                  run: () => changeAccess(false),
                })}
                className="rounded-lg bg-brand-hover px-3 py-2 text-sm text-white disabled:opacity-50">
                {issuedAt ? "استبدال رمز الدخول" : "تفعيل دخول ولي الأمر"}
              </button>
            )}
            {issuedAt && (
              <button type="button" disabled={busy}
                onClick={() => setPendingAction({
                  title: "إلغاء دخول ولي الأمر",
                  description: "سيتوقف رمز الدخول ورمز الاستجابة السريعة على البطاقة السابقة عن العمل.",
                  run: () => changeAccess(true),
                })}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50">
                إلغاء الدخول
              </button>
            )}
          </div>
        </section>
      )}

      <main className={`student-card student-card--background${card ? " student-card--parent" : ""}`}>
        <img
          src={cardBackground}
          alt=""
          aria-hidden="true"
          className="student-card__artwork"
        />
        {canViewPhoto && hasPhoto && photo?.id === id && (
          <img src={photo.url} alt="صورة الطالب" className="student-card__photo" />
        )}

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
          <WhatsAppPhone phone={student.phone} fallback="-" />
        </div>

        {qr && <img src={qr} alt={card ? "فتح سجل الطالب لولي الأمر" : "رمز التحقق"} className="student-card__qr" />}
        {card && (
          <div className="student-card__parent-code">
            <span>رمز دخول ولي الأمر</span>
            <strong dir="ltr">{card.accessCode}</strong>
            <span dir="ltr">{window.location.host}/parent-access</span>
          </div>
        )}
        <span className="student-card__code">{data.code || "—"}</span>
      </main>
    </div>
  );
}
