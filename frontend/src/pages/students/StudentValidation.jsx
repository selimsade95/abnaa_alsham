import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  MessageSquareText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EMPTY_MESSAGE = {
  name: "",
  phone: "",
  email: "",
  messageType: "complaint",
  content: "",
};

export default function StudentValidation() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState(EMPTY_MESSAGE);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    api
      .get(`/public/students/${id}/validation`, { signal: controller.signal })
      .then((response) => setData(response.data))
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError.response?.status === 404 ? "missing" : "unavailable");
        }
      });
    return () => controller.abort();
  }, [id]);
  if (!data && !error)
    return (
      <div
        className="min-h-screen flex items-center justify-center text-muted-foreground"
      >
        <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري التحقق...
      </div>
    );

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <main className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <header className="bg-accent px-6 py-5 flex items-center gap-3 border-b-2 border-ring">
          <img
            src="/assets/logo.png"
            alt="مدرسة أبناء الشام"
            className="h-14 w-14 object-contain"
          />
          <div>
            <div className="text-xl font-extrabold text-foreground">
              مدرسة أبناء الشام
            </div>
            <div className="text-xs text-accent-foreground">
              التحقق من بيانات الطالب
            </div>
          </div>
        </header>
        {error ? (
          <div className="p-10 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-bold text-foreground">
              تعذر التحقق
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error === "missing"
                ? "بيانات الطالب غير موجودة أو لم تعد متاحة."
                : "تعذر تحميل نتيجة التحقق. أعد المحاولة بعد قليل."}
            </p>
          </div>
        ) : (
          <div className="p-6 text-center">
            {!data.isActive && data.deactivationReason && (
              <div
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 text-right"
                role="alert"
              >
                <span className="font-bold">سبب التعطيل:</span>{" "}
                {data.deactivationReason}
              </div>
            )}
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${data.isActive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}
            >
              {data.isActive ? (
                <ShieldCheck className="h-8 w-8" />
              ) : (
                <ShieldAlert className="h-8 w-8" />
              )}
            </div>
            <div
              className={`mt-4 text-sm font-bold ${data.isActive ? "text-emerald-700" : "text-red-700"}`}
            >
              {data.isActive
                ? "بيانات الطالب صالحة والطالب نشط"
                : "الطالب غير نشط"}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-foreground">
              {data.fullName}
            </h1>
            <div className="mt-1 font-mono text-sm text-accent-foreground">
              {data.code}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-right">
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-muted-foreground">الصف</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.className || "—"}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs text-muted-foreground">الشعبة</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.section || "—"}
                </div>
              </div>
              <div className="col-span-2 rounded-lg bg-muted p-3">
                <div className="text-xs text-muted-foreground">السنة الدراسية</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.academicYear || "—"}
                </div>
              </div>
            </div>
            <Link to="/parent-access" className="mt-6 block text-sm font-semibold text-accent-foreground underline">
              بوابة ولي الأمر
            </Link>
            <button
              type="button"
              onClick={() => setMessageOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
            >
              <MessageSquareText className="h-4 w-4" />
              إرسال رسالة أو شكوى
            </button>
          </div>
        )}
      </main>
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إرسال رسالة إلى المدرسة</DialogTitle>
            <DialogDescription>
              املأ بيانات التواصل ورسالتك، وسيتمكن فريق المدرسة من الرد عليك.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSending(true);
              try {
                await api.post(`/public/students/${id}/messages`, message);
                toast.success("تم إرسال رسالتك بنجاح");
                setMessage(EMPTY_MESSAGE);
                setMessageOpen(false);
              } catch (sendError) {
                toast.error(
                  sendError?.response?.data?.detail || "تعذر إرسال الرسالة",
                );
              } finally {
                setSending(false);
              }
            }}
          >
            <label className="block text-sm font-medium text-foreground">
              الاسم
              <input
                required
                maxLength={150}
                autoComplete="name"
                value={message.name}
                onChange={(event) =>
                  setMessage({ ...message, name: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-input px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              رقم الهاتف
              <input
                required
                type="tel"
                minLength={5}
                maxLength={30}
                autoComplete="tel"
                value={message.phone}
                onChange={(event) =>
                  setMessage({ ...message, phone: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-input px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              البريد الإلكتروني
              <input
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={message.email}
                onChange={(event) =>
                  setMessage({ ...message, email: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-input px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              نوع الرسالة
              <select
                value={message.messageType}
                onChange={(event) =>
                  setMessage({ ...message, messageType: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2"
              >
                <option value="complaint">شكوى</option>
                <option value="suggestion">اقتراح</option>
                <option value="inquiry">استفسار</option>
                <option value="other">أخرى</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-foreground">
              محتوى الرسالة
              <textarea
                required
                minLength={1}
                maxLength={10000}
                rows={5}
                value={message.content}
                onChange={(event) =>
                  setMessage({ ...message, content: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-input px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {sending ? "جاري الإرسال..." : "إرسال"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
