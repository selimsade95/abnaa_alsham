import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const field = "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm";
export const button = "rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50";
export const panel = "space-y-3 rounded-xl border bg-card p-4";

export function Choice({ label, value, options, onChange, disabled }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);
  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`${label}: ${selected?.label || "—"}`} disabled={disabled || !options.length}
            className={`${field} text-start disabled:opacity-50`}>{selected?.label || "—"}</button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-36 p-0">
          <Command label={label}>
            <CommandInput placeholder={t("recitation.search")} />
            <CommandList>
              <CommandEmpty>{t("recitation.noOptions")}</CommandEmpty>
              {options.map((item) => (
                <CommandItem key={item.value} value={String(item.value)} keywords={[item.label]}
                  onSelect={() => { onChange(item.value); setOpen(false); }}>{item.label}</CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SessionDetails({ session, children }) {
  const { t, i18n } = useTranslation();
  const label = (key, options) => t(`recitation.${key}`, options);
  const date = new Date(session.createdAt).toLocaleDateString(i18n.language);
  return (
    <details className={panel}>
      <summary className="cursor-pointer font-semibold">
        {session.source === "quran" ? label("mushaf") : session.title} · {date} · {session.score}/100 · {session.rating}
      </summary>
      <p className="text-sm">
        {label("pageRange", { start: session.startPage, end: session.endPage })}
        {session.startJuz && " · " + label("juzRange", { start: session.startJuz, end: session.endJuz })}
      </p>
      {session.note && <p dir="auto" className="whitespace-pre-wrap">{session.note}</p>}
      <ul className="space-y-2">
        {session.pages.map((page) => (
          <li key={page.page} className="border-t pt-2 text-sm">
            <strong>{label("page", { page: page.page })} · {page.score}/100</strong>
            {page.reason && <p dir="auto">{page.reason}</p>}
            <ul className="ms-5 list-disc">
              {page.mistakes.map((mistake, index) => (
                <li key={index}><bdi>{mistake.word}</bdi> · {mistake.type} (−{mistake.deduction}){mistake.note && <> · <bdi>{mistake.note}</bdi></>}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {children}
    </details>
  );
}
