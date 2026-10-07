import { useSettings } from "@/hooks/useSettings";
import {
  BadgePercent,
  Hash,
  Loader2,
  Plus,
  Route,
  Save,
  Trash2,
} from "lucide-react";
import { useState } from "react";

const ENTITIES = [
  { key: "students", label: "الطلاب" },
  { key: "teachers", label: "المعلمون" },
  { key: "classes", label: "الصفوف" },
];

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#04CDF9] focus:outline-none focus:ring-2 focus:ring-[#04CDF9]/20 disabled:bg-gray-50";
const cardClass = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6";

export default function Settings() {
  const {
    canEdit,
    data,
    loading,
    preview,
    setData,
    registrationPaths,
    setRegistrationPaths,
    discountOptions,
    setDiscountOptions,
    refreshPreview,
    save,
  } = useSettings();
  const [newRegistrationPath, setNewRegistrationPath] = useState("");

  if (loading || !data)
    return (
      <div className="py-16 text-center text-gray-500">
        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" /> جاري التحميل...
      </div>
    );

  const addRegistrationPath = (event) => {
    event.preventDefault();
    const path = newRegistrationPath.trim();
    if (!path || registrationPaths.includes(path)) return;
    setRegistrationPaths((previous) => [...previous, path]);
    setNewRegistrationPath("");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <header className="rounded-2xl bg-gradient-to-l from-[#036A87] to-[#04A9CE] p-6 text-white shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white/15 p-3">
            <Hash className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">إعدادات النظام</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">
              إدارة أكواد السجلات، فئات الخصم، ومسارات التسجيل من مكان واحد.
            </p>
          </div>
        </div>
      </header>

      <section className={cardClass}>
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-lg bg-cyan-50 p-2 text-[#036A87]">
            <Hash className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">توليد الأكواد</h2>
            <p className="mt-1 text-sm text-gray-500">
              خصص بادئة وصيغة الرمز لكل نوع من السجلات.
            </p>
          </div>
        </div>
        <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3 text-xs leading-6 text-gray-600">
          الرموز المدعومة: <code>{"{PREFIX}"}</code> · <code>{"{YEAR}"}</code> ·{" "}
          <code>{"{YEAR2}"}</code> · <code>{"{SEQ}"}</code> ·{" "}
          <code>{"{SEQ:4}"}</code> · <code>{"{SEQ:6}"}</code>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {ENTITIES.map((entity) => (
            <div
              key={entity.key}
              className="rounded-xl border border-gray-200 bg-gray-50/70 p-4"
            >
              <h3 className="mb-3 text-sm font-semibold text-gray-800">
                {entity.label}
              </h3>
              <div className="space-y-3">
                <label className="block text-xs text-gray-500">
                  البادئة
                  <input
                    disabled={!canEdit}
                    value={data[entity.key].prefix}
                    onChange={(event) =>
                      setData((previous) => ({
                        ...previous,
                        [entity.key]: {
                          ...previous[entity.key],
                          prefix: event.target.value,
                        },
                      }))
                    }
                    data-testid={`prefix-${entity.key}`}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-xs text-gray-500">
                  الصيغة
                  <input
                    disabled={!canEdit}
                    value={data[entity.key].format}
                    onChange={(event) => {
                      const next = {
                        ...data,
                        [entity.key]: {
                          ...data[entity.key],
                          format: event.target.value,
                        },
                      };
                      setData(next);
                      refreshPreview(next);
                    }}
                    data-testid={`format-${entity.key}`}
                    className={`${inputClass} mt-1 font-mono`}
                  />
                </label>
                <div>
                  <span className="block text-xs text-gray-500">معاينة</span>
                  <div
                    data-testid={`preview-${entity.key}`}
                    className={`mt-1 rounded-lg border px-3 py-2 text-sm font-mono ${
                      preview[entity.key]?.startsWith?.("ERROR")
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-cyan-100 bg-cyan-50 text-[#036A87]"
                    }`}
                  >
                    {preview[entity.key] || "..."}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 p-4 text-sm text-gray-700">
          <input
            disabled={!canEdit}
            type="checkbox"
            checked={!!data.resetYearly}
            onChange={(event) =>
              setData((previous) => ({
                ...previous,
                resetYearly: event.target.checked,
              }))
            }
            data-testid="reset-yearly"
            className="h-4 w-4 accent-[#04CDF9]"
          />
          إعادة تعيين التسلسل كل سنة (السنة الجديدة تبدأ من 1)
        </label>
      </section>

      <section className={cardClass}>
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
            <BadgePercent className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">فئات الخصم</h2>
            <p className="mt-1 text-sm text-gray-500">
              تظهر هذه الخيارات في نموذج الطالب عند تفعيل الخصم.
            </p>
          </div>
        </div>
        {discountOptions.length ? (
          <div className="space-y-3">
            {discountOptions.map((option, index) => (
              <div
                key={`${index}-${option.name}`}
                className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
              >
                <label className="block text-xs text-gray-500">
                  اسم الفئة
                  <input
                    disabled={!canEdit}
                    value={option.name}
                    onChange={(event) =>
                      setDiscountOptions((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    data-testid={`discount-name-${index}`}
                    className={`${inputClass} mt-1`}
                    placeholder="مثال: خصم الإخوة"
                  />
                </label>
                <label className="block text-xs text-gray-500">
                  نسبة الخصم
                  <div className="relative mt-1">
                    <input
                      disabled={!canEdit}
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={option.percentage}
                      onChange={(event) =>
                        setDiscountOptions((previous) =>
                          previous.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, percentage: event.target.value }
                              : item,
                          ),
                        )
                      }
                      data-testid={`discount-percentage-${index}`}
                      className={`${inputClass} pe-8`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-gray-400">
                      %
                    </span>
                  </div>
                </label>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setDiscountOptions((previous) =>
                        previous.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label={`حذف فئة الخصم ${option.name || index + 1}`}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            لم تتم إضافة فئات خصم بعد.
          </div>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() =>
              setDiscountOptions((previous) => [
                ...previous,
                { name: "", percentage: "" },
              ])
            }
            data-testid="add-discount-option"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#04CDF9]/50 px-4 py-2 text-sm font-medium text-[#036A87] hover:bg-cyan-50"
          >
            <Plus className="h-4 w-4" /> إضافة فئة خصم
          </button>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-lg bg-violet-50 p-2 text-violet-700">
            <Route className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              مسارات التسجيل
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              حدد المسارات المتاحة للاختيار عند تسجيل الطلاب.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {registrationPaths.map((path, index) => (
            <div key={`${index}-${path}`} className="flex items-center gap-2">
              <input
                disabled={!canEdit}
                value={path}
                onChange={(event) =>
                  setRegistrationPaths((previous) =>
                    previous.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }
                data-testid={`registration-path-${index}`}
                className={inputClass}
              />
              {canEdit && (
                <button
                  type="button"
                  disabled={registrationPaths.length <= 1}
                  onClick={() =>
                    setRegistrationPaths((previous) =>
                      previous.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  aria-label={`حذف مسار التسجيل ${path}`}
                  className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <form className="mt-3 flex items-center gap-2" onSubmit={addRegistrationPath}>
            <input
              value={newRegistrationPath}
              onChange={(event) => setNewRegistrationPath(event.target.value)}
              placeholder="أضف مساراً جديداً"
              data-testid="new-registration-path"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={
                !newRegistrationPath.trim() ||
                registrationPaths.includes(newRegistrationPath.trim())
              }
              title="إضافة المسار"
              className="rounded-lg p-2 text-[#036A87] hover:bg-cyan-50 disabled:opacity-40"
            >
              <Plus className="h-5 w-5" />
            </button>
          </form>
        )}
      </section>

      {canEdit ? (
        <div className="flex justify-end">
          <button
            onClick={save}
            data-testid="save-settings-btn"
            className="inline-flex items-center gap-2 rounded-lg bg-[#04A9CE] px-5 py-2.5 font-semibold text-white shadow-sm hover:bg-[#038BAB]"
          >
            <Save className="h-4 w-4" /> حفظ الإعدادات
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          لا تملك صلاحية تعديل هذه الإعدادات.
        </div>
      )}
    </div>
  );
}
