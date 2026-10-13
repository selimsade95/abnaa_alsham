import { useState } from "react";
import {
  CheckCircle2,
  Mail,
  MessageSquareText,
  Phone,
  Send,
} from "lucide-react";
import api from "@/lib/api";

const EMPTY_FORM = {
  name: "",
  email: "",
  office: "",
  phone: "",
  subject: "",
  messageType: "complaint",
  message: "",
};

export default function ContactForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const updateField = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await api.post("/public/contact-messages", form);
      setForm(EMPTY_FORM);
      setSent(true);
    } catch (submitError) {
      setError(
        submitError?.response?.data?.detail ||
          "تعذر إرسال الرسالة. يرجى المحاولة مرة أخرى.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-gradient-to-b from-cyan-50 via-slate-50 to-white px-4 py-10 sm:py-16"
      dir="rtl"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-7 text-center">
          <img
            src="/assets/logo.png"
            alt="مؤسسة اقرأ الخيرية - مكتب الشكاوى"
            className="mx-auto mb-4 h-20 w-20 object-contain"
          />
          <p className="text-sm font-bold text-cyan-800">
            مؤسسة اقرأ الخيرية - مكتب الشكاوى
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900 sm:text-4xl">
            تواصل معنا
          </h1>
          <p className="mt-3 text-slate-600">
            أرسل استفسارك أو اقتراحك أو شكواك، وسيتابع فريق المدرسة رسالتك.
          </p>
        </header>

        <section className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-xl shadow-cyan-900/5 sm:p-8">
          {sent ? (
            <div className="py-8 text-center" role="status">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                تم استلام رسالتك
              </h2>
              <p className="mt-2 text-slate-600">
                شكراً لتواصلك مع مؤسسة اقرأ الخيرية - مكتب الشكاوى.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-6 rounded-lg bg-cyan-600 px-5 py-2.5 font-bold text-white transition hover:bg-cyan-700"
              >
                إرسال رسالة أخرى
              </button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  الاسم <span className="text-red-500">*</span>
                  <input
                    name="name"
                    required
                    maxLength={150}
                    autoComplete="name"
                    value={form.name}
                    onChange={updateField}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  رقم الهاتف <span className="text-red-500">*</span>
                  <span className="relative mt-1.5 block">
                    <Phone className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      name="phone"
                      required
                      type="tel"
                      minLength={5}
                      maxLength={30}
                      autoComplete="tel"
                      value={form.phone}
                      onChange={updateField}
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pe-9 ps-3 font-normal outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                    />
                  </span>
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  البريد الإلكتروني{" "}
                  <span className="font-normal text-slate-500">(اختياري)</span>
                  <input
                    name="email"
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={form.email}
                    onChange={updateField}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  المكتب{" "}
                  <span className="font-normal text-slate-500">(اختياري)</span>
                  <input
                    name="office"
                    maxLength={150}
                    value={form.office}
                    onChange={updateField}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                نوع الرسالة <span className="text-red-500">*</span>
                <select
                  name="messageType"
                  required
                  value={form.messageType}
                  onChange={updateField}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="complaint">شكوى</option>
                  <option value="suggestion">اقتراح</option>
                  <option value="inquiry">استفسار</option>
                  <option value="other">أخرى</option>
                </select>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                الموضوع <span className="text-red-500">*</span>
                <input
                  name="subject"
                  required
                  maxLength={200}
                  value={form.subject}
                  onChange={updateField}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                الرسالة <span className="text-red-500">*</span>{" "}
                <span className="text-xs text-[#BBB]">
                  (يرجى الكتابة بإيجاز)
                </span>
                <span className="relative mt-1.5 block">
                  <textarea
                    name="message"
                    required
                    maxLength={10000}
                    rows={6}
                    value={form.message}
                    onChange={updateField}
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white py-2.5 pe-9 ps-3 font-normal outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  />
                </span>
              </label>

              {error && (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={sending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 py-3 font-bold text-white transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {sending ? "جارٍ إرسال الرسالة..." : "إرسال الرسالة"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
