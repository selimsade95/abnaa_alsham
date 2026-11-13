import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { v4 as uuid } from "uuid";
import api from "@/lib/api";
import { getIntlLocale } from "@/i18n";
import { useAuth } from "@/lib/auth";
import ConfirmAction from "@/components/ConfirmAction";

const endpoint = "/grade-announcements";
const button = "rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50";
const panel = "space-y-4 rounded-xl border bg-card p-5";
const audiencesFor = (grade) => grade <= 2 ? ["combined"] : ["girls", "boys"];

function Announcements({ canConfigure }) {
  const { t } = useTranslation();
  const copy = (key, values) => t(`announcements.${key}`, values);
  const [grade, setGrade] = useState(9);
  const [groups, setGroups] = useState({});
  const [links, setLinks] = useState({});
  const [message, setMessage] = useState("");
  const [audiences, setAudiences] = useState(audiencesFor(9));
  const [draftId, setDraftId] = useState(null);
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.get(`${endpoint}/groups`, { signal: controller.signal }).then(({ data }) => {
      const next = Object.fromEntries(data.map(({ grade, audience, url }) => [`${grade}:${audience}`, url]));
      setGroups(next);
      setLinks(next);
    }).catch(() => {
      if (!controller.signal.aborted) toast.error(t("announcements.loadFailed"));
    });
    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    api.get(endpoint, { params: { grade, skip: page * 20 }, signal: controller.signal })
      .then(({ data }) => setHistory(data))
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistory({ error: true });
          toast.error(t("announcements.loadFailed"));
        }
      });
    return () => controller.abort();
  }, [grade, page, revision, t]);

  const refresh = () => {
    setHistory(null);
    setRevision((value) => value + 1);
  };

  const selectGrade = (value) => {
    setGrade(value);
    setAudiences(audiencesFor(value));
    setDraftId(null);
    setPage(0);
    refresh();
  };

  const saveLink = async (audience) => {
    const key = `${grade}:${audience}`;
    setBusy(true);
    try {
      const { data } = await api.put(`${endpoint}/groups/${grade}/${audience}`, { url: links[key] || "" });
      setGroups((current) => ({ ...current, [key]: data.url }));
      setLinks((current) => ({ ...current, [key]: data.url }));
      toast.success(copy("linkSaved"));
    } catch {
      toast.error(copy("linkFailed"));
    } finally {
      setBusy(false);
    }
  };

  const prepare = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const id = draftId || uuid();
    setDraftId(id);
    try {
      await api.post(endpoint, { id, grade, audiences, message });
      setMessage("");
      setDraftId(null);
      setPage(0);
      refresh();
      toast.success(copy("prepared"));
    } catch {
      toast.error(copy("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const copyMessage = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copy("copied"));
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      try {
        if (!document.execCommand("copy")) throw new Error();
        toast.success(copy("copied"));
      } catch {
        toast.error(copy("copyFailed"));
      } finally {
        field.remove();
      }
    }
  };

  const markSent = async (id, audience) => {
    setBusy(true);
    try {
      const { data } = await api.put(`${endpoint}/${id}/groups/${audience}/sent`);
      setHistory((current) => current?.items ? {
        ...current, items: current.items.map((item) => item.id === id ? data : item),
      } : current);
    } catch {
      toast.error(copy("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const available = audiencesFor(grade);
  const label = (audience) => copy(audience);
  const formatDate = (date) => new Date(date).toLocaleString(getIntlLocale());

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{copy("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy("instructions")}</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm font-semibold">
          <span className="block">{copy("grade")}</span>
          <select value={grade} disabled={busy} onChange={(event) => selectGrade(Number(event.target.value))}
            className="rounded-lg border bg-card px-3 py-2">
            {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{copy("gradeNumber", { grade: value })}</option>
            ))}
          </select>
        </label>
        {canConfigure && (
          <button type="button" className={button} onClick={() => setShowSettings(!showSettings)}>
            {copy("groupSettings")}
          </button>
        )}
      </div>
      {canConfigure && showSettings && (
        <section className={panel}>
          <h2 className="font-semibold">{copy("groupSettings")}</h2>
          {available.map((audience) => {
            const key = `${grade}:${audience}`;
            return (
              <form key={key} className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => { event.preventDefault(); saveLink(audience); }}>
                <label className="min-w-48 flex-1 space-y-1 text-sm">
                  <span className="block">{label(audience)}</span>
                  <input type="url" dir="ltr" maxLength={512} value={links[key] || ""} disabled={busy}
                    placeholder="https://chat.whatsapp.com/…"
                    onChange={(event) => setLinks({ ...links, [key]: event.target.value })}
                    className="w-full rounded-lg border p-2" />
                </label>
                <button className={button} disabled={busy}>{copy("saveLink")}</button>
              </form>
            );
          })}
        </section>
      )}
      <form className={panel} onSubmit={prepare}>
        <fieldset disabled={busy} className="space-y-3">
          <legend className="font-semibold">{copy("recipients")}</legend>
          <div className="flex flex-wrap gap-4">
            {available.map((audience) => (
              <label key={audience} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={audiences.includes(audience)} onChange={(event) => {
                  setAudiences(event.target.checked ? [...audiences, audience] : audiences.filter((item) => item !== audience));
                  setDraftId(null);
                }} />
                {label(audience)}
                {!groups[`${grade}:${audience}`] && <span className="text-amber-800">({copy("missingLink")})</span>}
              </label>
            ))}
          </div>
          <label className="block space-y-1 text-sm font-semibold">
            <span className="block">{copy("message")}</span>
            <textarea required maxLength={4000} rows={4} dir="auto" value={message}
              onChange={(event) => { setMessage(event.target.value); setDraftId(null); }}
              className="w-full rounded-lg border p-3 font-normal" />
          </label>
          <button className={`${button} bg-primary text-white`}
            disabled={!message.trim() || !audiences.length || audiences.some((audience) => !groups[`${grade}:${audience}`])}>
            {copy("prepare")}
          </button>
        </fieldset>
      </form>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">{copy("history")}</h2>
        {!history && <p role="status">{copy("loading")}</p>}
        {history?.error && <button type="button" className={button} onClick={refresh}>{copy("retry")}</button>}
        {history?.items?.length === 0 && <p className="text-muted-foreground">{copy("empty")}</p>}
        {history?.items?.map((item) => (
          <article key={item.id} className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{item.createdBy} · {formatDate(item.createdAt)}</p>
              <button type="button" className={button} onClick={() => copyMessage(item.message)}>{copy("copy")}</button>
            </div>
            <p dir="auto" className="whitespace-pre-wrap break-words">{item.message}</p>
            <ul className="space-y-2">
              {item.groups.map(({ audience, sentAt, sentBy }) => {
                const href = groups[`${item.grade}:${audience}`];
                return (
                  <li key={audience} className="flex flex-wrap items-center gap-3 border-t pt-2 text-sm">
                    <strong>{label(audience)}</strong>
                    <span>{sentAt ? copy("sentDetails", { by: sentBy, date: formatDate(sentAt) }) : copy("pending")}</span>
                    {href && <a className={button} href={href} target="_blank" rel="noopener noreferrer">{copy("open")}</a>}
                    {!sentAt && (
                      <button type="button" className={button} disabled={busy} onClick={() => setConfirmation({
                        title: copy("markSent"), description: copy("confirmSent", { audience: label(audience) }),
                        run: () => markSent(item.id, audience),
                      })}>{copy("markSent")}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
        {(page > 0 || history?.hasMore) && (
          <div className="flex gap-2">
            <button type="button" className={button} disabled={!page || busy || !history}
              onClick={() => { setPage(page - 1); setHistory(null); }}>{t("controls.previous")}</button>
            <button type="button" className={button} disabled={!history?.hasMore || busy}
              onClick={() => { setPage(page + 1); setHistory(null); }}>{t("controls.next")}</button>
          </div>
        )}
      </section>
      <ConfirmAction action={confirmation} onClose={() => setConfirmation(null)} />
    </main>
  );
}

export default function GradeAnnouncements() {
  const { user, has } = useAuth();
  return <Announcements key={user?.activeBranch?.id} canConfigure={has("announcements.configure")} />;
}
