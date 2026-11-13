import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ColumnSelector({
  columns,
  selectedColumns,
  onChange,
  maxSelections,
  labelKey = "general.chooseColumns",
  selectAllLabelKey = "general.selectAllColumns",
}) {
  const { t } = useTranslation();

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground marker:hidden">
        {t(labelKey)}
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-lg">
        <button
          type="button"
          onClick={() =>
            onChange(
              columns
                .map(({ key }) => key)
                .slice(0, maxSelections ?? columns.length),
            )
          }
          className="mb-1 w-full rounded px-2 py-1 text-right text-xs text-accent-foreground hover:bg-muted"
        >
          {t(selectAllLabelKey)}
        </button>
        {maxSelections != null && (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {t("general.selectedCount", { count: selectedColumns.length })} /{" "}
            {maxSelections}
          </div>
        )}
        {columns.map(({ key, label }) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={selectedColumns.includes(key)}
              disabled={
                maxSelections != null &&
                selectedColumns.length >= maxSelections &&
                !selectedColumns.includes(key)
              }
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selectedColumns, key]
                    : selectedColumns.filter((column) => column !== key),
                )
              }
              className="rounded border-input text-accent-foreground focus:ring-ring"
            />
            {label}
          </label>
        ))}
      </div>
    </details>
  );
}
