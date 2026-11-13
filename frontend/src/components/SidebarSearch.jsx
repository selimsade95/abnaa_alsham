import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";

export default function SidebarSearch({ onNavigate }) {
  const { t } = useTranslation();
  const { key } = useLocation();
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const query = input.trim();

  useEffect(() => {
    setInput("");
    setResult(null);
  }, [key]);

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/quick-search", {
          params: { q: query }, signal: controller.signal,
        });
        if (!controller.signal.aborted) setResult({ query, data });
      } catch {
        if (!controller.signal.aborted) setResult({ query, error: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const current = result?.query === query ? result : null;
  const groups = Object.entries(current?.data || {}).filter(([, items]) => items.length);

  return (
    <div className="px-3 pt-3" onKeyDown={(event) => {
      if (event.key === "Escape") {
        setInput("");
        setResult(null);
      }
    }}>
      <label className="relative block">
        <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={100}
          autoComplete="off"
          aria-label={t("quickSearch.label")}
          placeholder={t("quickSearch.placeholder")}
          className="w-full rounded-lg border border-input bg-card py-2 pe-2 ps-9 text-sm"
        />
      </label>
      {query.length >= 2 && (
        <div className="mt-2 max-h-[30vh] overflow-y-auto rounded-lg border bg-card p-2 text-sm">
          <div role="status" className="text-xs text-muted-foreground">
            {!current ? t("quickSearch.loading") : current.error
              ? t("quickSearch.error") : groups.length === 0 ? t("quickSearch.empty") : null}
          </div>
          {groups.map(([type, items]) => (
            <section key={type} aria-label={t(`quickSearch.${type}`)} className="mb-2 last:mb-0">
              <h2 className="px-2 py-1 text-xs font-bold text-muted-foreground">{t(`quickSearch.${type}`)}</h2>
              {items.map((item) => (
                <Link key={item.id} to={`/${type}/${item.id}`} onClick={onNavigate}
                  className="block rounded-md px-2 py-1.5 hover:bg-accent focus-visible:bg-accent">
                  <span className="block truncate">{item.name || item.code || "—"}</span>
                  {item.name && item.code && <bdi className="text-xs text-muted-foreground">{item.code}</bdi>}
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
