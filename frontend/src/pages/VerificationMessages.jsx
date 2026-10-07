import { useCallback, useEffect, useState } from "react";
import {
  Filter,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

const TYPE_LABELS = {
  complaint: "شكوى",
  suggestion: "اقتراح",
  inquiry: "استفسار",
  other: "أخرى",
};

function whatsappUrl(phone, response) {
  const number = phone.replace(/\D/g, "");
  const text = response
    ? `رد مدرسة أبناء الشام:\n${response}`
    : "مرحباً، بخصوص رسالتك إلى مدرسة أبناء الشام.";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export default function VerificationMessages() {
  const { has } = useAuth();
  const canReply = has("messages.reply");
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadMessages = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/messages");
      setMessages(response.data);
    } catch (loadError) {
      setError(loadError?.response?.data?.detail || "تعذر تحميل الرسائل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredMessages = messages.filter((message) => {
    const matchesSearch =
      !normalizedSearch ||
      [
        message.name,
        message.phone,
        message.email,
        message.studentName,
        message.studentCode,
        message.content,
        message.response,
      ].some((value) =>
        String(value || "").toLocaleLowerCase().includes(normalizedSearch),
      );
    const messageDate = message.createdAt?.slice(0, 10) || "";
    const matchesStatus =
      !statusFilter ||
      (statusFilter === "responded"
        ? Boolean(message.response)
        : !message.response);
    return (
      matchesSearch &&
      (!typeFilter || message.messageType === typeFilter) &&
      matchesStatus &&
      (!dateFrom || messageDate >= dateFrom) &&
      (!dateTo || messageDate <= dateTo)
    );
  });
  const hasFilters =
    search || typeFilter || statusFilter || dateFrom || dateTo;
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const sendReply = async (message) => {
    const response = drafts[message.id]?.trim();
    if (!response) {
      toast.error("اكتب الرد أولاً");
      return;
    }
    setSendingId(message.id);
    try {
      const result = await api.post(`/messages/${message.id}/reply`, {
        response,
      });
      setMessages((current) =>
        current.map((item) => (item.id === result.data.id ? result.data : item)),
      );
      setDrafts((current) => ({ ...current, [message.id]: "" }));
      toast.success("تم حفظ الرد وإرساله بالبريد الإلكتروني");
    } catch (replyError) {
      toast.error(
        replyError?.response?.data?.detail || "تعذر حفظ الرد أو إرساله",
      );
      await loadMessages();
    } finally {
      setSendingId(null);
    }
  };

  const resendReply = async (message) => {
    setResendingId(message.id);
    try {
      const result = await api.post(`/messages/${message.id}/resend`);
      setMessages((current) =>
        current.map((item) => (item.id === result.data.id ? result.data : item)),
      );
      toast.success("تم إرسال الرد بالبريد الإلكتروني");
    } catch (sendError) {
      toast.error(sendError?.response?.data?.detail || "تعذر إرسال البريد");
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">الرسائل</h1>
        <p className="mt-1 text-sm text-gray-500">
          عرض الرسائل الواردة والبحث فيها والرد عليها.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو الهاتف أو البريد أو محتوى الرسالة..."
              aria-label="البحث في الرسائل"
              className="w-full rounded-lg border border-gray-300 py-2 pe-9 ps-3 text-sm"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="تصفية حسب نوع الرسالة"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">كل أنواع الرسائل</option>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="تصفية حسب حالة الرد"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">كل الحالات</option>
            <option value="open">بحاجة إلى رد</option>
            <option value="responded">تم الرد</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="shrink-0">من تاريخ</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="shrink-0">إلى تاريخ</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1 text-sm text-gray-500">
              <Filter className="h-4 w-4" />
              {`${filteredMessages.length} رسالة`}
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-sm text-[#036A87] hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                مسح الفلاتر
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-500">
          <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
          جاري تحميل الرسائل...
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          <MessageSquareText className="mx-auto mb-3 h-8 w-8 text-gray-400" />
          لا توجد رسائل حتى الآن.
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          لا توجد رسائل مطابقة للبحث والفلاتر المحددة.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMessages.map((message) => (
            <article
              key={message.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                    {TYPE_LABELS[message.messageType] || "أخرى"}
                  </span>
                  <h2 className="mt-2 text-lg font-bold text-gray-900">
                    {message.name}
                  </h2>
                  {(message.studentName || message.studentCode) && (
                    <p className="text-sm text-gray-600">
                      {message.studentName}
                      {message.studentCode ? ` (${message.studentCode})` : ""}
                    </p>
                  )}
                </div>
                <time className="text-xs text-gray-500">
                  {new Date(message.createdAt).toLocaleString("ar-EG")}
                </time>
              </div>

              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold">الهاتف: </dt>
                  <dd className="inline" dir="ltr">
                    {message.phone}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">البريد: </dt>
                  <dd className="inline">{message.email}</dd>
                </div>
              </dl>
              <div className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-800">
                {message.content}
              </div>

              {message.response && (
                <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold text-emerald-800">
                    رد {message.responseBy || "المدرسة"} —{" "}
                    {message.responseAt
                      ? new Date(message.responseAt).toLocaleString("ar-EG")
                      : ""}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                    {message.response}
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {message.phone && (
                  <a
                    href={whatsappUrl(message.phone, message.response)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-green-600 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
                  >
                    إرسال عبر واتساب
                  </a>
                )}
                {canReply && message.emailDeliveryStatus === "failed" && (
                  <button
                    type="button"
                    disabled={resendingId === message.id}
                    onClick={() => resendReply(message)}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-60"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {resendingId === message.id
                      ? "جاري إعادة الإرسال..."
                      : "إعادة إرسال البريد"}
                  </button>
                )}
                {message.response && message.emailDeliveryStatus === "sent" && (
                  <span className="self-center text-sm text-emerald-700">
                    تم إرسال الرد بالبريد
                  </span>
                )}
              </div>

              {canReply && (
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <label
                    htmlFor={`reply-${message.id}`}
                    className="mb-2 block text-sm font-semibold text-gray-700"
                  >
                    {message.response ? "إضافة رد جديد" : "الرد على الرسالة"}
                  </label>
                  <textarea
                    id={`reply-${message.id}`}
                    rows={3}
                    maxLength={10000}
                    value={drafts[message.id] || ""}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [message.id]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  />
                  <button
                    type="button"
                    disabled={sendingId === message.id}
                    onClick={() => sendReply(message)}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    {sendingId === message.id
                      ? "جاري الإرسال..."
                      : "حفظ الرد وإرساله بالبريد"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
