import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { getIntlLocale } from "@/i18n";

const PAGE_SIZE = 50;

const METHOD_STYLES = {
  DELETE: "bg-red-100 text-red-700",
  POST: "bg-yellow-100 text-yellow-800",
  PUT: "bg-cyan-100 text-cyan-800",
  PATCH: "bg-blue-100 text-blue-800",
};

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(getIntlLocale());
}

export default function AuditLogs() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/audit-logs", {
        params: { limit: PAGE_SIZE, skip: page * PAGE_SIZE },
      });
      setItems(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch {
      setError(t("auditLog.loadError"));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t("auditLog.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("auditLog.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t("auditLog.refresh")}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">{t("auditLog.method")}</th>
              <th className="px-4 py-3 font-medium">{t("auditLog.request")}</th>
              <th className="px-4 py-3 font-medium">{t("auditLog.actor")}</th>
              <th className="px-4 py-3 font-medium">{t("auditLog.status")}</th>
              <th className="px-4 py-3 font-medium">
                {t("auditLog.createdAt")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
                  {t("auditLog.loading")}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-red-600">
                  {error}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  {t("auditLog.empty")}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        METHOD_STYLES[item.method] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.method}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code dir="ltr" className="break-all text-xs text-gray-700">
                      {item.path}
                    </code>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    {item.username || item.userId || t("auditLog.anonymous")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                      {item.statusCode}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatDate(item.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-gray-500">
          {t("auditLog.page", { count: page + 1 })} / {pageCount}
          {" · "}
          {t("auditLog.entryCount", { count: total })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => current - 1)}
            disabled={page === 0 || loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
          >
            {t("auditLog.previous")}
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page + 1 >= pageCount || loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
          >
            {t("auditLog.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
