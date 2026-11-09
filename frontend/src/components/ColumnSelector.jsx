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
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 marker:hidden">
        {t(labelKey)}
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
        <button
          type="button"
          onClick={() =>
            onChange(
              columns
                .map(({ key }) => key)
                .slice(0, maxSelections ?? columns.length),
            )
          }
          className="mb-1 w-full rounded px-2 py-1 text-right text-xs text-[#036A87] hover:bg-gray-50"
        >
          {t(selectAllLabelKey)}
        </button>
        {maxSelections != null && (
          <div className="px-2 py-1 text-xs text-gray-500">
            {t("general.selectedCount", { count: selectedColumns.length })} /{" "}
            {maxSelections}
          </div>
        )}
        {columns.map(({ key, label }) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
              className="rounded border-gray-300 text-[#036A87] focus:ring-[#04CDF9]"
            />
            {label}
          </label>
        ))}
      </div>
    </details>
  );
}
