import { useSettings } from "@/hooks/useSettings";
import { Loader2 } from "lucide-react";

const ENTITIES = [
  { key: "students", label: "الطلاب" },
  { key: "teachers", label: "المعلمون" },
  { key: "classes", label: "الصفوف" },
];

export default function Settings() {
  const { canEdit, data, loading, preview, setData, save, updateEntity } =
    useSettings();

  if (loading || !data)
    return (
      <div className="text-center text-gray-500 py-16">
        <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">إعدادات النظام</h1>
        <p className="text-sm text-gray-500 mt-1">
          توليد أكواد الطلاب والمعلمين والصفوف تلقائياً
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          توليد الأكواد
        </h2>
        <div className="text-xs text-gray-500 mb-4">
          الرموز المدعومة: <code>{"{PREFIX}"}</code> · <code>{"{YEAR}"}</code> ·{" "}
          <code>{"{YEAR2}"}</code> · <code>{"{SEQ}"}</code> ·{" "}
          <code>{"{SEQ:4}"}</code> · <code>{"{SEQ:6}"}</code>
        </div>

        <div className="space-y-4">
          {ENTITIES.map((ent) => (
            <div
              key={ent.key}
              className="rounded-lg border border-gray-200 p-4"
            >
              <div className="text-sm font-semibold text-gray-900 mb-3">
                {ent.label}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    البادئة
                  </label>
                  <input
                    disabled={!canEdit}
                    value={data[ent.key].prefix}
                    onChange={(e) =>
                      updateEntity(ent.key, "prefix", e.target.value)
                    }
                    data-testid={`prefix-${ent.key}`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    الصيغة
                  </label>
                  <input
                    disabled={!canEdit}
                    value={data[ent.key].format}
                    onChange={(e) =>
                      updateEntity(ent.key, "format", e.target.value)
                    }
                    data-testid={`format-${ent.key}`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    معاينة
                  </label>
                  <div
                    data-testid={`preview-${ent.key}`}
                    className={`rounded-lg border px-3 py-2 text-sm font-mono ${preview[ent.key]?.startsWith?.("ERROR") ? "bg-red-50 text-red-700 border-red-200" : "bg-brand-light text-[#036A87] border-[#04CDF9]/30"}`}
                  >
                    {preview[ent.key] || "..."}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-gray-200 p-4">
            <label className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
              <input
                disabled={!canEdit}
                type="checkbox"
                checked={!!data.resetYearly}
                onChange={(e) => {
                  const n = { ...data, resetYearly: e.target.checked };
                  setData(n);
                  refreshPreview(n);
                }}
                data-testid="reset-yearly"
                className="h-4 w-4 accent-[#04CDF9]"
              />
              <span>إعادة تعيين التسلسل كل سنة (السنة الجديدة تبدأ من 1)</span>
            </label>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <button
                onClick={save}
                data-testid="save-settings-btn"
                className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1]"
              >
                حفظ الإعدادات
              </button>
            </div>
          )}
          {!canEdit && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              لا تملك صلاحية تعديل هذه الإعدادات.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
