import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { API } from "@/lib/api";
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

const PERIOD_LABELS = {
  first: "الفصل الأول",
  second: "الفصل الثاني",
  final: "النهائي",
};

export default function StudentValidation() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState(EMPTY_MESSAGE);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api
      .get(`/public/students/${id}/validation`)
      .then((response) => setData(response.data))
      .catch(() => setError(true));
  }, [id]);

  if (!data && !error)
    return (
      <div
        className="min-h-screen flex items-center justify-center text-gray-500"
        dir="rtl"
      >
        <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري التحقق...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8" dir="rtl">
      <main className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-[#BDEFFA] bg-white shadow-lg">
        <header className="bg-[#E0F9FF] px-6 py-5 flex items-center gap-3 border-b-2 border-[#04CDF9]">
          <img
            src="/assets/logo.png"
            alt="مدرسة أبناء الشام"
            className="h-14 w-14 object-contain"
          />
          <div>
            <div className="text-xl font-extrabold text-gray-900">
              مدرسة أبناء الشام
            </div>
            <div className="text-xs text-[#036A87]">
              التحقق من بيانات الطالب
            </div>
          </div>
        </header>
        {error ? (
          <div className="p-10 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-bold text-gray-900">
              تعذر التحقق
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              بيانات الطالب غير موجودة أو لم تعد متاحة.
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
            <h1 className="mt-3 text-2xl font-extrabold text-gray-900">
              {data.fullName}
            </h1>
            {data.hasPersonalPhoto && (
              <img
                src={`${API}/public/students/${id}/validation/personal-photo`}
                alt="صورة الطالب"
                className="mx-auto mt-3 h-24 w-20 rounded-lg border border-gray-200 object-cover"
              />
            )}
            <div className="mt-1 font-mono text-sm text-[#036A87]">
              {data.code}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-right">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">الصف</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.className || "—"}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">الشعبة</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.section || "—"}
                </div>
              </div>
              <div className="col-span-2 rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">السنة الدراسية</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.academicYear || "—"}
                </div>
              </div>
            </div>
            {data.grades?.length > 0 && (
              <section className="mt-6 text-right">
                <h2 className="mb-3 text-lg font-bold text-gray-900">
                  درجات الطالب
                </h2>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2">المادة</th>
                        <th className="px-3 py-2">الدرجة</th>
                        <th className="px-3 py-2">الفترة</th>
                        <th className="px-3 py-2">السنة الدراسية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.grades.map((grade, index) => (
                        <tr
                          key={`${grade.academicYear}-${grade.period}-${grade.subjectName}-${index}`}
                          className="border-t border-gray-100"
                        >
                          <td className="px-3 py-2">{grade.subjectName}</td>
                          <td className="px-3 py-2 font-semibold">
                            {grade.score}
                          </td>
                          <td className="px-3 py-2">
                            {PERIOD_LABELS[grade.period] || grade.period}
                          </td>
                          <td className="px-3 py-2">{grade.academicYear}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <button
              type="button"
              onClick={() => setMessageOpen(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#03A9D1]"
            >
              <MessageSquareText className="h-4 w-4" />
              إرسال رسالة أو شكوى
            </button>
          </div>
        )}
      </main>
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
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
            <label className="block text-sm font-medium text-gray-700">
              الاسم
              <input
                required
                maxLength={150}
                autoComplete="name"
                value={message.name}
                onChange={(event) =>
                  setMessage({ ...message, name: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              نوع الرسالة
              <select
                value={message.messageType}
                onChange={(event) =>
                  setMessage({ ...message, messageType: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
              >
                <option value="complaint">شكوى</option>
                <option value="suggestion">اقتراح</option>
                <option value="inquiry">استفسار</option>
                <option value="other">أخرى</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
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
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-lg bg-[#04CDF9] px-4 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60"
            >
              {sending ? "جاري الإرسال..." : "إرسال"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
