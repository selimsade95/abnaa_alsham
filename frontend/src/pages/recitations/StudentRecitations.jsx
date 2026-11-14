import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { v4 as uuid } from "uuid";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ConfirmAction from "@/components/ConfirmAction";
import { button, Choice, field, panel, SessionDetails } from "./RecitationControls";

const initialRange = { source: "quran", bookId: null, startJuz: null, endJuz: null, startPage: null, endPage: null };
const blankPage = { base: 100, reason: "", mistakes: [] };
const rangeOf = (start, end) => start <= end ? Array.from({ length: end - start + 1 }, (_, index) => start + index) : [];
const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100);
const scorePage = (page, types) => Math.max(0, cents(page.base) -
  page.mistakes.reduce((sum, item) => sum + cents(types[item.typeId]?.deduction || 0), 0));

function Editor({ settings, save, saving }) {
  const { t } = useTranslation();
  const label = (key, options) => t(`recitation.${key}`, options);
  const [range, setRange] = useState(initialRange);
  const [draft, setDraft] = useState({});
  const [note, setNote] = useState("");
  const [currentPage, setCurrentPage] = useState(null);
  const types = Object.fromEntries(settings.mistakes.map((item) => [item.id, item]));
  const quran = range.source === "quran";
  const book = settings.books.find((item) => item.id === range.bookId);
  const bounds = (side) => quran
    ? settings.juz.find((item) => item.juz === range[`${side}Juz`])
    : book && { start: 1, end: book.pageCount };
  const change = (key, value) => setRange((previous) => ({
    ...previous, [key]: value,
    ...(key === "startJuz" ? { startPage: null } : {}),
    ...(key === "endJuz" ? { endPage: null } : {}),
  }));
  const changeSource = (changes) => {
    setRange({ ...initialRange, ...changes });
    setDraft({});
    setCurrentPage(null);
  };
  const pageOptions = (side) => {
    const span = bounds(side);
    if (!span) return [];
    const start = side === "end" ? Math.max(span.start, range.startPage || 1) : span.start;
    return rangeOf(start, span.end).map((value) => ({ value, label: String(value) }));
  };
  const valid = range.startPage && range.endPage && range.startPage <= range.endPage &&
    (!quran || (range.startJuz && range.endJuz && range.startJuz <= range.endJuz));
  const pageNumbers = valid ? rangeOf(range.startPage, range.endPage) : [];
  const pageNumber = pageNumbers.includes(currentPage) ? currentPage : pageNumbers[0];
  const page = draft[pageNumber] || blankPage;
  const pages = pageNumbers.map((number) => ({ ...(draft[number] || blankPage), page: number }));
  const score = pages.length ? Math.round(pages.reduce((sum, row) => sum + scorePage(row, types), 0) / pages.length) / 100 : null;
  const rating = score === null ? null : [...settings.ratings]
    .sort((a, b) => Number(b.minimum) - Number(a.minimum)).find((item) => score >= Number(item.minimum));
  const updatePage = (changes) => setDraft({ ...draft, [pageNumber]: { ...page, ...changes } });
  const updateMistake = (index, changes) => updatePage({
    mistakes: page.mistakes.map((item, i) => i === index ? { ...item, ...changes } : item),
  });
  const validPages = pages.every((row) => row.base !== "" && Number(row.base) >= 0 && Number(row.base) <= 100 &&
    (Number(row.base) === 100 || row.reason.trim()) && row.mistakes.every((item) => item.typeId && item.word.trim()));
  const submit = (event) => {
    event.preventDefault();
    if (!pages.length || !validPages || saving) return;
    save({ ...range, settingsVersion: settings.version, note,
      pages: pages.map(({ mistakes, ...row }) => ({
        ...row, mistakes: mistakes.map(({ typeId, word, note }) => ({ typeId, word, note })),
      })),
    });
  };

  return (
    <form onSubmit={submit} className={panel}>
      <fieldset disabled={saving} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Choice label={label("source")} value={range.source}
            options={["quran", "book"].map((value) => ({ value, label: label(value) }))}
            onChange={(source) => changeSource({ source })} />
          {!quran && <Choice label={label("book")} value={range.bookId}
            options={settings.books.map((item) => ({ value: item.id, label: item.title }))}
            onChange={(bookId) => changeSource({ source: "book", bookId })} />}
          {["start", "end"].map((side) => (
            <div className="space-y-2" key={side}>
              {quran && <Choice label={label(`${side}Juz`)} value={range[`${side}Juz`]}
                options={settings.juz.map((item) => ({ value: item.juz, label: label("juzOption", item) }))}
                onChange={(value) => change(`${side}Juz`, value)} />}
              <Choice label={label(`${side}Page`)} value={range[`${side}Page`]}
                options={pageOptions(side)} onChange={(value) => change(`${side}Page`, value)} />
            </div>
          ))}
        </div>
        {!quran && !settings.books.length && <p>{label("noBooks")}</p>}
        {range.startPage && range.endPage && !valid && <p role="alert">{label("invalidRange")}</p>}
        {pages.length > 0 && (
          <section className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice label={label("editPage")} value={pageNumber}
                options={pageNumbers.map((value) => ({ value, label: label("page", { page: value }) }))}
                onChange={setCurrentPage} />
              <label>{label("base")}<input type="number" min={0} max={100} step="0.01" required
                className={field} value={page.base} onChange={(event) => updatePage({ base: event.target.value })} /></label>
            </div>
            {Number(page.base) < 100 && <label>{label("reason")}<input className={field} required maxLength={500}
              value={page.reason} onChange={(event) => updatePage({ reason: event.target.value })} /></label>}
            <p className="text-sm font-semibold">{label("pageScore", { score: scorePage(page, types) / 100 })}</p>
            {page.mistakes.map((item, index) => (
              <div key={item.id} className="grid items-end gap-2 rounded-lg border p-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
                <Choice label={label("mistakeType")} value={item.typeId}
                  options={settings.mistakes.map((type) => ({ value: type.id, label: `${type.title} (−${type.deduction})` }))}
                  onChange={(typeId) => updateMistake(index, { typeId })} />
                <label>{label("word")}<input className={field} required maxLength={200} dir="auto" value={item.word}
                  onChange={(event) => updateMistake(index, { word: event.target.value })} /></label>
                <label>{label("mistakeNote")}<input className={field} maxLength={500} dir="auto" value={item.note}
                  onChange={(event) => updateMistake(index, { note: event.target.value })} /></label>
                <button type="button" className={button}
                  onClick={() => updatePage({ mistakes: page.mistakes.filter((_, i) => i !== index) })}>{label("remove")}</button>
              </div>
            ))}
            <button type="button" className={button} disabled={!settings.mistakes.length || page.mistakes.length >= 100}
              onClick={() => updatePage({ mistakes: [...page.mistakes, { id: uuid(), typeId: null, word: "", note: "" }] })}>{label("addMistake")}</button>
          </section>
        )}
        <label className="block">{label("sessionNote")}<textarea className={field} maxLength={2000} dir="auto"
          value={note} onChange={(event) => setNote(event.target.value)} /></label>
        {rating && <p className="font-semibold">{label("sessionScore", { score, rating: rating.title })}</p>}
        <button className={`${button} bg-primary text-primary-foreground`}
          disabled={!pages.length || !validPages || saving}>{label("save")}</button>
      </fieldset>
    </form>
  );
}

export default function StudentRecitations() {
  const { id } = useParams();
  return <RecitationsForStudent key={id} id={id} />;
}

function RecitationsForStudent({ id }) {
  const { t } = useTranslation();
  const label = (key) => t(`recitation.${key}`);
  const { has } = useAuth();
  const canView = has("recitations.view");
  const canCreate = has("recitations.create");
  const canPublish = has("recitations.publish");
  const endpoint = `/students/${id}/recitations`;
  const [settings, setSettings] = useState(null);
  const [created, setCreated] = useState(null);
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pendingPublication, setPendingPublication] = useState(null);

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    api.get(endpoint, { params: { skip: page * 10 }, signal: controller.signal })
      .then(({ data }) => setHistory(data))
      .catch(() => {
        if (!controller.signal.aborted) setHistory({ error: true });
      });
    return () => controller.abort();
  }, [endpoint, canView, page, revision]);

  const start = async () => {
    setActive(true);
    setFailed(false);
    setSettings(null);
    try {
      const { data } = await api.get(`${endpoint}/options`);
      setSettings(data);
    } catch {
      setFailed(true);
    }
  };

  const save = async (session) => {
    setSaving(true);
    try {
      const { data } = await api.post(endpoint, session);
      setCreated(data);
      setActive(false);
      setPage(0);
      setRevision((value) => value + 1);
      toast.success(label("saved"));
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" && !detail.startsWith("recitation.") ? detail : label("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const publish = async (session) => {
    setSaving(true);
    try {
      const { data } = await api.put(`${endpoint}/${session.id}/publication`, { published: !session.published });
      setCreated((previous) => previous?.id === session.id ? { ...previous, ...data } : previous);
      setHistory((previous) => previous?.items ? {
        ...previous, items: previous.items.map((item) => item.id === session.id ? { ...item, ...data } : item),
      } : previous);
    } catch {
      toast.error(label("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const renderSession = (session) => (
    <SessionDetails key={session.id} session={session}>
      <p className="text-sm">{label(session.published ? "published" : "private")}</p>
      {canPublish && <button type="button" disabled={saving} className={button}
        onClick={() => setPendingPublication(session)}>{label(session.published ? "unpublish" : "publish")}</button>}
    </SessionDetails>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-4">
      <Link className="text-sm underline" to={`/students/${id}`}>{label("studentProfile")}</Link>
      <h1 className="text-2xl font-bold">{label("title")}</h1>
      <ConfirmAction action={pendingPublication ? {
        title: label(pendingPublication.published ? "unpublish" : "publish"),
        description: label(pendingPublication.published ? "confirmUnpublish" : "confirmPublish"),
        run: () => publish(pendingPublication),
      } : null} onClose={() => setPendingPublication(null)} />
      {canCreate && !active && <button type="button" className={button} onClick={start}>{label("newSession")}</button>}
      {active && <>
        <button type="button" className={button} disabled={saving} onClick={() => setActive(false)}>{label("cancel")}</button>
        {!settings ? <p role="status">{label(failed ? "loadFailed" : "loading")}</p> : settings.ratings.length
          ? <Editor settings={settings} save={save} saving={saving} /> : <p>{label("needsSettings")}</p>}
      </>}
      {!canView && created && renderSession(created)}
      {canView && <section className="space-y-3">
        <h2 className="font-semibold">{label("history")}</h2>
        {!history ? <p role="status">{label("loading")}</p> : history.error ? <p role="alert">{label("loadFailed")}</p> :
          history.items.length ? history.items.map(renderSession) : <p>{label("empty")}</p>}
        {(page > 0 || history?.hasMore) && <div className="flex gap-2">
          <button type="button" className={button} disabled={!page || !history}
            onClick={() => { setHistory(null); setPage(page - 1); }}>{t("controls.previous")}</button>
          <button type="button" className={button} disabled={!history?.hasMore}
            onClick={() => { setHistory(null); setPage(page + 1); }}>{t("controls.next")}</button>
        </div>}
      </section>}
    </main>
  );
}
