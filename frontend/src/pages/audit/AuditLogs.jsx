import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import { getIntlLocale } from "@/i18n";

const PAGE_SIZE = 50;

const METHOD_STYLES = {
  DELETE: "bg-red-100 text-red-700",
  POST: "bg-yellow-100 text-yellow-800",
  PUT: "bg-accent text-accent-foreground",
  PATCH: "bg-blue-100 text-blue-800",
};
const STATUS_OPTIONS = [200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 500];

const EMPTY_FILTERS = {
  user: "",
  statuses: [],
  dateFrom: "",
  dateTo: "",
  type: "",
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
  const [statusOptions, setStatusOptions] = useState(STATUS_OPTIONS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(appliedFilters).filter(([, value]) => value),
      );
      if (appliedFilters.statuses.length) {
        activeFilters.status = appliedFilters.statuses.join(",");
        delete activeFilters.statuses;
      }
      const response = await api.get("/audit-logs", {
        params: {
          limit: PAGE_SIZE,
          skip: page * PAGE_SIZE,
          ...activeFilters,
        },
      });
      setItems(response.data.items || []);
      setTotal(response.data.total || 0);
      setStatusOptions(
        response.data.statusOptions?.length
          ? response.data.statusOptions
          : STATUS_OPTIONS,
      );
    } catch {
      setError(t("auditLog.loadError"));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const updateFilter = (key) => (event) => {
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  };
  const applyFilters = (event) => {
    event.preventDefault();
    setPage(0);
    setAppliedFilters({ ...filters });
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    setAppliedFilters(EMPTY_FILTERS);
  };
  const requestLabel = (item) => {
    if (item.requestLabel) return item.requestLabel;
    const parts = (item.path || "").split("/").filter(Boolean);
    const resource = parts
      .reverse()
      .filter((part) => part.toLowerCase() !== "api")
      .find((part) => !/^(?:\d+|[0-9a-f-]{16,})$/i.test(part));
    return resource
      ? resource.replace(/[-_]/g, " ")
      : t("auditLog.unspecifiedRequest");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("auditLog.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auditLog.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t("auditLog.refresh")}
        </button>
      </div>

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="space-y-1 text-sm text-foreground">
          <span>{t("auditLog.filterUser")}</span>
          <input
            type="text"
            value={filters.user}
            onChange={updateFilter("user")}
            className="w-full rounded-lg border border-input px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm text-foreground">
          <span>{t("auditLog.filterStatus")}</span>
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-input bg-card px-3 py-2 marker:hidden">
              <span>
                {filters.statuses.length
                  ? t("general.selectedCount", {
                      count: filters.statuses.length,
                    })
                  : t("auditLog.allStatuses")}
              </span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 max-h-64 w-full min-w-40 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg">
              {statusOptions.map((statusCode) => (
                <label
                  key={statusCode}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(statusCode)}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        statuses: event.target.checked
                          ? [...current.statuses, statusCode]
                          : current.statuses.filter(
                              (item) => item !== statusCode,
                            ),
                      }))
                    }
                    className="rounded border-input"
                  />
                  {statusCode}
                </label>
              ))}
            </div>
          </details>
        </label>
        <label className="space-y-1 text-sm text-foreground">
          <span>{t("auditLog.filterDateFrom")}</span>
          <input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={updateFilter("dateFrom")}
            className="w-full rounded-lg border border-input px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm text-foreground">
          <span>{t("auditLog.filterDateTo")}</span>
          <input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={updateFilter("dateTo")}
            className="w-full rounded-lg border border-input px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm text-foreground">
          <span>{t("auditLog.filterType")}</span>
          <select
            value={filters.type}
            onChange={updateFilter("type")}
            className="w-full rounded-lg border border-input bg-card px-3 py-2"
          >
            <option value="">{t("auditLog.allTypes")}</option>
            {Object.keys(METHOD_STYLES).map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("auditLog.applyFilters")}
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {t("auditLog.clearFilters")}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
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
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
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
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {t("auditLog.empty")}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-border hover:bg-muted"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        METHOD_STYLES[item.method] ||
                        "bg-secondary text-foreground"
                      }`}
                    >
                      {item.method}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-foreground">{requestLabel(item)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">
                    <span
                      title={
                        item.username
                          ? `${t("auditLog.username")}: ${item.username}`
                          : undefined
                      }
                      className="cursor-help"
                    >
                      {item.fullName || item.username || item.userId || t("auditLog.anonymous")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                      {item.statusCode}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">
          {t("auditLog.page", { count: page + 1 })} / {pageCount}
          {" · "}
          {t("auditLog.entryCount", { count: total })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => current - 1)}
            disabled={page === 0 || loading}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
          >
            {t("auditLog.previous")}
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page + 1 >= pageCount || loading}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
          >
            {t("auditLog.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
