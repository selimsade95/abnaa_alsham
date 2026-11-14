import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuid } from "uuid";
import { toast } from "sonner";
import api from "@/lib/api";
import { button, field, panel } from "./RecitationControls";

const sections = [
  ["ratings", "minimum", 0, 100, "0.01"],
  ["mistakes", "deduction", 0, 100, "0.01"],
  ["books", "pageCount", 1, 5000, "1"],
];

export default function RecitationSettings() {
  const { t } = useTranslation();
  const label = (key) => t(`recitation.${key}`);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get("/recitations/settings", { signal: controller.signal }).then(({ data }) => {
      if (!data.ratings.length) data.ratings = [{ id: uuid(), title: "", minimum: 0 }];
      setSettings(data);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = Object.fromEntries(sections.map(([key, metric]) => [
        key, settings[key].map((item) => ({ ...item, [metric]: Number(item[metric]) })),
      ]));
      const { data } = await api.put("/recitations/settings", payload);
      setSettings(data);
      toast.success(label("saved"));
    } catch {
      toast.error(label("settingsError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">{label("settings")}</h1>
      {!settings ? <p role="status">{label(failed ? "loadFailed" : "loading")}</p> : (
        <form onSubmit={save}>
          <fieldset disabled={saving} className="space-y-4">
            {sections.map(([key, metric, min, max, step]) => (
              <section key={key} className={panel}>
                <h2 className="font-semibold">{label(key)}</h2>
                {key === "ratings" && <p className="text-sm text-muted-foreground">{label("ratingHelp")}</p>}
                {settings[key].map((item) => (
                  <div key={item.id} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_auto]">
                    <label>{label("name")}<input className={field} required maxLength={120} value={item.title}
                      onChange={(event) => setSettings({ ...settings, [key]: settings[key].map((row) => row.id === item.id ? { ...row, title: event.target.value } : row) })} /></label>
                    <label>{label(metric)}<input className={field} required type="number" min={min} max={max} step={step} value={item[metric]}
                      onChange={(event) => setSettings({ ...settings, [key]: settings[key].map((row) => row.id === item.id ? { ...row, [metric]: event.target.value } : row) })} /></label>
                    <button type="button" className={button} disabled={key === "ratings" && settings[key].length === 1}
                      onClick={() => setSettings({ ...settings, [key]: settings[key].filter((row) => row.id !== item.id) })}>{label("remove")}</button>
                  </div>
                ))}
                <button type="button" className={button} disabled={settings[key].length >= 100}
                  onClick={() => setSettings({ ...settings, [key]: [...settings[key], { id: uuid(), title: "", [metric]: min }] })}>{label("add")}</button>
              </section>
            ))}
            <button className={`${button} bg-primary text-primary-foreground`}>{label("save")}</button>
          </fieldset>
        </form>
      )}
    </main>
  );
}
