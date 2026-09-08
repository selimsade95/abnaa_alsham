import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowRight } from "lucide-react";
import {
  emptyStudent,
  LANGUAGES,
  STATUS_LABELS,
  REGISTRATION_PATHS,
  ORPHAN_DOC_TYPES,
} from "@/lib/studentDefaults";

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
      {title}
    </h3>
    <div className="space-y-4">{children}</div>
  </div>
);
const Label = ({ children, required }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1.5">
    {children} {required && <span className="text-red-500">*</span>}
  </label>
);
const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9] focus:border-transparent transition-all";
const Field = ({ label, required, children }) => (
  <div>
    <Label required={required}>{label}</Label>
    {children}
  </div>
);
const Radio = ({ name, checked, onChange, label, testid }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer">
    <input
      type="radio"
      name={name}
      checked={checked}
      onChange={onChange}
      data-testid={testid}
      className="h-4 w-4 accent-[#04CDF9]"
    />
    <span className="text-sm text-gray-700">{label}</span>
  </label>
);

export default function StudentForm({ mode }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(emptyStudent());
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [hobbiesInput, setHobbiesInput] = useState("");
  const [errors, setErrors] = useState({});
  const [classes, setClasses] = useState([]);
  const [showFullInfo, setShowFullInfo] = useState(false);

  useEffect(() => {
    api
      .get("/classes", { params: { limit: 500 } })
      .then((r) => setClasses(r.data.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === "edit" && id) {
      api
        .get(`/students/${id}`)
        .then((r) => {
          const d = r.data;
          if (d.student?.birthdate)
            d.student.birthdate = d.student.birthdate.slice(0, 10);
          const merged = {
            ...emptyStudent(),
            ...d,
            student: { ...emptyStudent().student, ...d.student },
            fullInfo: { ...emptyStudent().fullInfo, ...(d.fullInfo || {}) },
            currentClassId: d.currentClassId || "",
          };
          merged.fees = {
            academicYear: d.fees?.academicYear || "",
            totalPayable: d.fees?.totalPayable || 0,
          };
          setData(merged);
          setHobbiesInput((d.student?.hobbies || []).join("، "));
        })
        .catch(() => toast.error("تعذر تحميل بيانات الطالب"))
        .finally(() => setLoading(false));
    }
  }, [id, mode]);

  const update = (path, value) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const toggleLanguage = (lang) => {
    const set = new Set(data.student.languages);
    if (set.has(lang)) set.delete(lang);
    else set.add(lang);
    update("student.languages", Array.from(set));
  };

  const addSibling = () =>
    update("siblings", [
      ...data.siblings,
      {
        order: data.siblings.length + 1,
        fullName: "",
        gender: "male",
        class: "",
      },
    ]);
  const removeSibling = (idx) =>
    update(
      "siblings",
      data.siblings
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, order: i + 1 })),
    );
  const updateSibling = (idx, k, v) =>
    update(
      "siblings",
      data.siblings.map((s, i) => (i === idx ? { ...s, [k]: v } : s)),
    );

  const addEdu = () =>
    update("previousEducation", [
      ...data.previousEducation,
      {
        classes: "",
        schoolName: "",
        startingDate: "",
        endingDate: "",
        results: "",
      },
    ]);
  const removeEdu = (idx) =>
    update(
      "previousEducation",
      data.previousEducation.filter((_, i) => i !== idx),
    );
  const updateEdu = (idx, k, v) =>
    update(
      "previousEducation",
      data.previousEducation.map((e, i) => (i === idx ? { ...e, [k]: v } : e)),
    );

  const validate = () => {
    const e = {};
    if (!data.student.fullName?.trim()) e.fullName = "الاسم الكامل مطلوب";
    if (!data.student.gender) e.gender = "الجنس مطلوب";
    if (!data.student.birthdate) e.birthdate = "تاريخ الميلاد مطلوب";
    if (!data.student.newClass?.trim()) e.newClass = "الصف الجديد مطلوب";
    if (!data.student.status) e.status = "الوضع مطلوب";
    if (!data.student.registrationPath)
      e.registrationPath = "مسار التسجيل مطلوب";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("يرجى تعبئة الحقول المطلوبة");
      return;
    }
    const hobbies = hobbiesInput
      .split(/[,،]/)
      .map((h) => h.trim())
      .filter(Boolean);
    const payload = structuredClone(data);
    payload.student.hobbies = hobbies;
    if (payload.student.birthdate?.length === 10)
      payload.student.birthdate = `${payload.student.birthdate}T00:00:00`;
    // clean initial payment on edit
    if (mode === "edit") delete payload.initialPayment;
    else if (
      !payload.initialPayment?.amount ||
      Number(payload.initialPayment.amount) <= 0
    )
      delete payload.initialPayment;
    setSaving(true);
    try {
      if (mode === "edit") {
        await api.put(`/students/${id}`, payload);
        toast.success("تم التحديث");
        nav(`/students/${id}`);
      } else {
        const res = await api.post("/students", payload);
        toast.success("تم الإنشاء");
        nav(`/students/${res.data.id}`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "تعذر حفظ البيانات");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="text-center text-gray-500 py-16">
        <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
      </div>
    );

  const s = data.student;

  return (
    <form onSubmit={submit} className="space-y-6" data-testid="student-form">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={() => nav(-1)}
            className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {mode === "edit" ? "تعديل بيانات طالب" : "تسجيل طالب جديد"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            الحقول المميزة بـ <span className="text-red-500">*</span> مطلوبة
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          data-testid="save-student-btn"
          className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60"
        >
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>

      <Section title="معلومات الطالب">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="الاسم الكامل" required>
            <input
              data-testid="input-fullName"
              className={inputCls}
              value={s.fullName}
              onChange={(e) => update("student.fullName", e.target.value)}
            />
            {errors.fullName && (
              <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>
            )}
          </Field>
          <Field label="تاريخ الميلاد" required>
            <input
              data-testid="input-birthdate"
              type="date"
              className={inputCls}
              value={s.birthdate}
              onChange={(e) => update("student.birthdate", e.target.value)}
            />
            {errors.birthdate && (
              <p className="text-xs text-red-600 mt-1">{errors.birthdate}</p>
            )}
          </Field>
          <Field label="مكان الميلاد">
            <input
              className={inputCls}
              value={s.birthPlace}
              onChange={(e) => update("student.birthPlace", e.target.value)}
            />
          </Field>
          <Field label="الجنس" required>
            <div className="flex items-center gap-6 pt-2">
              <Radio
                name="gender"
                checked={s.gender === "male"}
                onChange={() => update("student.gender", "male")}
                label="ذكر"
                testid="gender-male"
              />
              <Radio
                name="gender"
                checked={s.gender === "female"}
                onChange={() => update("student.gender", "female")}
                label="أنثى"
                testid="gender-female"
              />
            </div>
            {errors.gender && (
              <p className="text-xs text-red-600 mt-1">{errors.gender}</p>
            )}
          </Field>
          <Field label="مسار التسجيل" required>
            <select
              data-testid="select-registrationPath"
              className={inputCls}
              value={s.registrationPath}
              onChange={(e) =>
                update("student.registrationPath", e.target.value)
              }
            >
              {REGISTRATION_PATHS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {errors.registrationPath && (
              <p className="text-xs text-red-600 mt-1">
                {errors.registrationPath}
              </p>
            )}
          </Field>
          <Field label="الصف السابق">
            <input
              className={inputCls}
              value={s.previousClass}
              onChange={(e) => update("student.previousClass", e.target.value)}
            />
          </Field>
          <Field label="الصف الجديد" required>
            {classes.length > 0 ? (
              <>
                <select
                  data-testid="select-currentClass"
                  className={inputCls}
                  value={data.currentClassId || ""}
                  onChange={(e) => {
                    const cid = e.target.value;
                    update("currentClassId", cid);
                    const c = classes.find((x) => x.id === cid);
                    if (c) update("student.newClass", c.name);
                  }}
                >
                  <option value="">— اختر صفاً —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.section ? ` — ${c.section}` : ""}
                      {c.academicYear ? ` — ${c.academicYear}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  data-testid="input-newClass"
                  className={inputCls + " mt-2"}
                  value={s.newClass}
                  onChange={(e) => update("student.newClass", e.target.value)}
                  placeholder="أو اكتب الصف يدوياً"
                />
              </>
            ) : (
              <input
                data-testid="input-newClass"
                className={inputCls}
                value={s.newClass}
                onChange={(e) => update("student.newClass", e.target.value)}
              />
            )}
            {errors.newClass && (
              <p className="text-xs text-red-600 mt-1">{errors.newClass}</p>
            )}
          </Field>
          <Field label="الوضع" required>
            <select
              data-testid="select-status"
              className={inputCls}
              value={s.status}
              onChange={(e) => update("student.status", e.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="يتيم؟">
            <div className="flex items-center gap-6 pt-2">
              <Radio
                name="orphan"
                checked={!s.orphan}
                onChange={() => update("student.orphan", false)}
                label="لا"
              />
              <Radio
                name="orphan"
                checked={s.orphan}
                onChange={() => update("student.orphan", true)}
                label="نعم"
                testid="orphan-yes"
              />
            </div>
          </Field>
          {s.orphan && (
            <>
              <Field label="يتيم من">
                <div className="flex items-center gap-6 pt-2">
                  <Radio
                    name="orphanOf"
                    checked={s.orphanOf === "mother"}
                    onChange={() => update("student.orphanOf", "mother")}
                    label="الأم"
                  />
                  <Radio
                    name="orphanOf"
                    checked={s.orphanOf === "father"}
                    onChange={() => update("student.orphanOf", "father")}
                    label="الأب"
                  />
                  <Radio
                    name="orphanOf"
                    checked={s.orphanOf === "both"}
                    onChange={() => update("student.orphanOf", "both")}
                    label="كلاهما"
                  />
                </div>
              </Field>
              <Field label="نوع وثيقة اليتم">
                <select
                  data-testid="select-orphanDocType"
                  className={inputCls}
                  value={s.orphanDocType || ""}
                  onChange={(e) =>
                    update("student.orphanDocType", e.target.value)
                  }
                >
                  <option value="">— اختر —</option>
                  {ORPHAN_DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  يمكنك رفع الملف من صفحة عرض الطالب بعد الحفظ.
                </p>
              </Field>
              {s.orphanDocType === "أخرى" && (
                <Field label="وصف الوثيقة">
                  <input
                    className={inputCls}
                    value={s.orphanDocDescription || ""}
                    onChange={(e) =>
                      update("student.orphanDocDescription", e.target.value)
                    }
                  />
                </Field>
              )}
            </>
          )}
        </div>
        <Field label="العنوان الحالي">
          <textarea
            rows={2}
            className={inputCls}
            value={s.currentAddress}
            onChange={(e) => update("student.currentAddress", e.target.value)}
          />
        </Field>
        <Field label="اللغات">
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => {
              const active = s.languages.includes(l);
              return (
                <button
                  type="button"
                  key={l}
                  onClick={() => toggleLanguage(l)}
                  className={`rounded-full border px-3 py-1 text-sm ${active ? "bg-brand-light text-[#036A87] border-[#04CDF9]" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="الهوايات">
          <input
            className={inputCls}
            value={hobbiesInput}
            onChange={(e) => setHobbiesInput(e.target.value)}
            placeholder="مثال: قراءة، رسم، رياضة"
          />
          <p className="text-xs text-gray-500 mt-1">
            افصل بين الهوايات بفاصلة (،).
          </p>
        </Field>
        <Field label="رموز العنوان">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {["sector", "block", "minutes", "floor", "apartment"].map((k) => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">
                  {
                    {
                      sector: "القطاع",
                      block: "المجمع",
                      minutes: "الدقائق",
                      floor: "الطابق",
                      apartment: "الشقة",
                    }[k]
                  }
                </label>
                <input
                  className={inputCls}
                  value={s.addressCodes?.[k] || ""}
                  onChange={(e) =>
                    update(`student.addressCodes.${k}`, e.target.value)
                  }
                />
              </div>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="أمراض مزمنة؟">
            <div className="flex items-center gap-6 pt-2">
              <Radio
                name="chronic"
                checked={!s.chronicDisease}
                onChange={() => update("student.chronicDisease", false)}
                label="لا"
              />
              <Radio
                name="chronic"
                checked={s.chronicDisease}
                onChange={() => update("student.chronicDisease", true)}
                label="نعم"
              />
            </div>
          </Field>
          {s.chronicDisease && (
            <Field label="تفاصيل المرض المزمن">
              <textarea
                rows={2}
                className={inputCls}
                value={s.chronicDiseaseDetails}
                onChange={(e) =>
                  update("student.chronicDiseaseDetails", e.target.value)
                }
              />
            </Field>
          )}
          <Field label="عادات دائمة؟">
            <div className="flex items-center gap-6 pt-2">
              <Radio
                name="habits"
                checked={!s.permanentHabits}
                onChange={() => update("student.permanentHabits", false)}
                label="لا"
              />
              <Radio
                name="habits"
                checked={s.permanentHabits}
                onChange={() => update("student.permanentHabits", true)}
                label="نعم"
              />
            </div>
          </Field>
          {s.permanentHabits && (
            <Field label="تفاصيل العادات">
              <textarea
                rows={2}
                className={inputCls}
                value={s.permanentHabitsDetails}
                onChange={(e) =>
                  update("student.permanentHabitsDetails", e.target.value)
                }
              />
            </Field>
          )}
        </div>
      </Section>

      <Section title="رسوم التسجيل">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="السنة الدراسية">
            <input
              data-testid="input-academicYear"
              className={inputCls}
              value={data.fees.academicYear}
              onChange={(e) => update("fees.academicYear", e.target.value)}
              placeholder="2026-2027"
            />
          </Field>
          <Field label="إجمالي المستحق">
            <input
              data-testid="input-totalPayable"
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={data.fees.totalPayable}
              onChange={(e) =>
                update("fees.totalPayable", Number(e.target.value))
              }
            />
          </Field>
        </div>
        {mode === "create" && (
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <div className="text-sm font-medium text-gray-700 mb-3">
              الدفعة الأولية (اختيارية)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="المبلغ">
                <input
                  data-testid="input-initialAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={data.initialPayment.amount}
                  onChange={(e) =>
                    update("initialPayment.amount", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="الفصل">
                <select
                  className={inputCls}
                  value={data.initialPayment.semester}
                  onChange={(e) =>
                    update("initialPayment.semester", e.target.value)
                  }
                >
                  <option value="first">الفصل الأول</option>
                  <option value="second">الفصل الثاني</option>
                  <option value="full_year">السنة كاملة</option>
                </select>
              </Field>
              <Field label="تاريخ الدفع">
                <input
                  type="date"
                  className={inputCls}
                  value={data.initialPayment.paymentDate}
                  onChange={(e) =>
                    update("initialPayment.paymentDate", e.target.value)
                  }
                />
              </Field>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              إذا كان المبلغ صفراً فلن تُنشأ دفعة أولية.
            </p>
          </div>
        )}
      </Section>

      <Section title="الإخوة">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-right">الاسم الكامل</th>
                <th className="px-3 py-2 text-right">الجنس</th>
                <th className="px-3 py-2 text-right">الصف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.siblings.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    لا يوجد إخوة مضافون.
                  </td>
                </tr>
              )}
              {data.siblings.map((sib, idx) => (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-600">{sib.order}</td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={sib.fullName}
                      onChange={(e) =>
                        updateSibling(idx, "fullName", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={inputCls}
                      value={sib.gender}
                      onChange={(e) =>
                        updateSibling(idx, "gender", e.target.value)
                      }
                    >
                      <option value="male">ذكر</option>
                      <option value="female">أنثى</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={sib.class}
                      onChange={(e) =>
                        updateSibling(idx, "class", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeSibling(idx)}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addSibling}
          data-testid="add-sibling-btn"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" /> إضافة أخ / أخت
        </button>
      </Section>

      {["father", "mother"].map((who) => (
        <Section
          key={who}
          title={who === "father" ? "بيانات الأب" : "بيانات الأم"}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={who === "father" ? "اسم الأب" : "اسم الأم"}>
              <input
                className={inputCls}
                value={data[who].name}
                onChange={(e) => update(`${who}.name`, e.target.value)}
              />
            </Field>
            <Field label="الحالة">
              <div className="flex items-center gap-6 pt-2">
                <Radio
                  name={`${who}-alive`}
                  checked={data[who].alive}
                  onChange={() => update(`${who}.alive`, true)}
                  label="على قيد الحياة"
                />
                <Radio
                  name={`${who}-alive`}
                  checked={!data[who].alive}
                  onChange={() => update(`${who}.alive`, false)}
                  label="متوفى"
                />
              </div>
            </Field>
            <Field label="رقم الهاتف">
              <input
                className={inputCls}
                value={data[who].phone}
                onChange={(e) => update(`${who}.phone`, e.target.value)}
              />
            </Field>
            <Field label="العنوان">
              <input
                className={inputCls}
                value={data[who].address}
                onChange={(e) => update(`${who}.address`, e.target.value)}
              />
            </Field>
            <Field label="المهنة">
              <input
                className={inputCls}
                value={data[who].profession}
                onChange={(e) => update(`${who}.profession`, e.target.value)}
              />
            </Field>
            <Field label="رقم واتساب">
              <input
                className={inputCls}
                value={data[who].whatsapp}
                onChange={(e) => update(`${who}.whatsapp`, e.target.value)}
              />
            </Field>
            <Field label="تلغرام">
              <input
                className={inputCls}
                value={data[who].telegram}
                onChange={(e) => update(`${who}.telegram`, e.target.value)}
              />
            </Field>
          </div>
        </Section>
      ))}

      <Section title="معلومات عامة">
        <Field label="رقم واتساب مجموعة المدرسة">
          <input
            className={inputCls}
            value={data.general.whatsappGroupPhone}
            onChange={(e) =>
              update("general.whatsappGroupPhone", e.target.value)
            }
          />
        </Field>
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            جهة الاتصال في حالات الطوارئ
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="الاسم">
              <input
                className={inputCls}
                value={data.general.emergencyContact.name}
                onChange={(e) =>
                  update("general.emergencyContact.name", e.target.value)
                }
              />
            </Field>
            <Field label="صلة القرابة">
              <input
                className={inputCls}
                value={data.general.emergencyContact.relation}
                onChange={(e) =>
                  update("general.emergencyContact.relation", e.target.value)
                }
              />
            </Field>
            <Field label="الهاتف">
              <input
                className={inputCls}
                value={data.general.emergencyContact.phone}
                onChange={(e) =>
                  update("general.emergencyContact.phone", e.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="التعليم السابق">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-right">الصفوف</th>
                <th className="px-3 py-2 text-right">اسم المدرسة</th>
                <th className="px-3 py-2 text-right">البدء</th>
                <th className="px-3 py-2 text-right">الانتهاء</th>
                <th className="px-3 py-2 text-right">النتائج</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.previousEducation.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    لا توجد سجلات.
                  </td>
                </tr>
              )}
              {data.previousEducation.map((row, idx) => (
                <tr key={idx} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={row.classes}
                      onChange={(e) =>
                        updateEdu(idx, "classes", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={row.schoolName}
                      onChange={(e) =>
                        updateEdu(idx, "schoolName", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={row.startingDate}
                      onChange={(e) =>
                        updateEdu(idx, "startingDate", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={row.endingDate}
                      onChange={(e) =>
                        updateEdu(idx, "endingDate", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className={inputCls}
                      value={row.results}
                      onChange={(e) =>
                        updateEdu(idx, "results", e.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeEdu(idx)}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addEdu}
          data-testid="add-edu-btn"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" /> إضافة سجل
        </button>
      </Section>

      <Section title="التعليم الشرعي">
        <textarea
          rows={4}
          className={inputCls}
          value={data.islamicLegalEducation}
          onChange={(e) => update("islamicLegalEducation", e.target.value)}
        />
      </Section>
      <Section title="أفضل إنجاز للطالب">
        <textarea
          rows={4}
          className={inputCls}
          value={data.bestAchievement}
          onChange={(e) => update("bestAchievement", e.target.value)}
        />
      </Section>

      {/* Full Information (Excel-based) — collapsible */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          type="button"
          onClick={() => setShowFullInfo((v) => !v)}
          className="w-full flex items-center justify-between p-6 text-right"
          data-testid="toggle-fullinfo-btn"
        >
          <span className="text-lg font-semibold text-gray-900">
            معلومات إضافية (سجل تفصيلي)
          </span>
          <span className="text-sm text-[#036A87]">
            {showFullInfo ? "إخفاء" : "إظهار"}
          </span>
        </button>
        {showFullInfo && (
          <div className="px-6 pb-6 border-t border-gray-100 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                ["fullInfo.serial", "م"],
                ["fullInfo.classSerial", "تسلسل صفي"],
                ["fullInfo.serial2", "م2"],
                ["fullInfo.department", "القسم"],
                ["fullInfo.generalRegNumber", "رقم السجل العام"],
                ["fullInfo.ministerialNumber", "الرقم الوزاري"],
                ["fullInfo.fatherFirstName", "اسم الأب"],
                ["fullInfo.familyName", "النسبة"],
                ["fullInfo.secondName", "الاسم الثاني"],
                ["fullInfo.tripleName", "الاسم الثلاثي"],
                ["fullInfo.motherTripleName", "اسم الأم الثلاثي"],
                ["fullInfo.grandfatherName", "اسم الجد"],
                ["fullInfo.ageYears", "العمر بالسنوات"],
                ["fullInfo.nationality", "الجنسية"],
                ["fullInfo.familyStatus", "حالة الطالب الأسرية"],
                ["fullInfo.primaryLanguage", "لغة الطالب"],
                ["fullInfo.distinctiveMarks", "علامات مميزة"],
                ["fullInfo.bloodType", "زمرة الدم"],
                ["fullInfo.familySize", "عدد أفراد العائلة"],
                ["fullInfo.siblingsInSchool", "عدد الإخوة في المدرسة"],
                ["fullInfo.livesWith", "مع من يسكن الطالب"],
                ["fullInfo.housingGovernorate", "المحافظة"],
                ["fullInfo.housingRegion", "المنطقة"],
                ["fullInfo.housingDistrict", "الناحية"],
                ["fullInfo.housingTown", "البلدة"],
                ["fullInfo.recordNumber", "رقم المحضر"],
                ["fullInfo.housingType", "نوع المسكن"],
                ["fullInfo.housingOwnership", "ملكية السكن (ملك/إيجار)"],
                ["fullInfo.fatherMaritalStatus", "الحالة الاجتماعية للأب"],
                ["fullInfo.fatherSpecialty", "اختصاص الأب في مهنته"],
                ["fullInfo.motherMaritalStatus", "الحالة الاجتماعية للأم"],
                ["fullInfo.motherSpecialty", "اختصاص الأم في مهنتها"],
                ["fullInfo.originalGovernorate", "المحافظة الأصلية"],
                ["fullInfo.registrationAmana", "الأمانة"],
                ["fullInfo.registrationPlace", "مكان القيد"],
                ["fullInfo.registrationNumber", "رقم القيد"],
                ["fullInfo.enrollmentDate", "تاريخ الالتحاق بالمدرسة"],
                ["fullInfo.enrollmentClass", "صف الالتحاق"],
                ["fullInfo.branch", "الفرع"],
                ["fullInfo.class2", "الصف2"],
                ["fullInfo.height", "قياس الطول"],
                ["fullInfo.width", "قياس العرض"],
                ["fullInfo.footSize", "قياس القدم"],
                ["fullInfo.uniformSize", "قياس الثوب"],
                ["fullInfo.weight", "الوزن"],
              ].map(([path, label]) => (
                <Field key={path} label={label}>
                  <input
                    className={inputCls}
                    value={path.split(".").reduce((o, k) => o?.[k] ?? "", data)}
                    onChange={(e) => update(path, e.target.value)}
                  />
                </Field>
              ))}
              <Field label="أبناء كادر">
                <div className="flex items-center gap-6 pt-2">
                  <Radio
                    name="staffChildren"
                    checked={!data.fullInfo?.staffChildren}
                    onChange={() => update("fullInfo.staffChildren", false)}
                    label="لا"
                  />
                  <Radio
                    name="staffChildren"
                    checked={!!data.fullInfo?.staffChildren}
                    onChange={() => update("fullInfo.staffChildren", true)}
                    label="نعم"
                  />
                </div>
              </Field>
            </div>
          </div>
        )}
      </div>

      <Section title="معلومات أخرى">
        <Field label="هل يوجد مدخنون في أسرة الطالب؟">
          <div className="flex items-center gap-6 pt-2">
            <Radio
              name="smokers"
              checked={!data.otherInfo.familySmokers}
              onChange={() => update("otherInfo.familySmokers", false)}
              label="لا"
            />
            <Radio
              name="smokers"
              checked={data.otherInfo.familySmokers}
              onChange={() => update("otherInfo.familySmokers", true)}
              label="نعم"
            />
          </div>
        </Field>
        <Field label="كيف سيصل الطالب إلى المدرسة؟">
          <textarea
            rows={2}
            className={inputCls}
            value={data.otherInfo.transportation}
            onChange={(e) => update("otherInfo.transportation", e.target.value)}
          />
        </Field>
        <Field label="ملاحظات (داخلية - لا تظهر في المطبوعة)">
          <textarea
            rows={3}
            className={inputCls}
            value={data.otherInfo.notes}
            onChange={(e) => update("otherInfo.notes", e.target.value)}
            data-testid="input-notes"
          />
          <p className="text-xs text-amber-700 mt-1">
            هذه الملاحظات إدارية داخلية ولن تُطبع.
          </p>
        </Field>
      </Section>

      <Section title="التوقيع">
        <p className="text-sm text-gray-600 leading-relaxed border-r-4 border-[#04CDF9] pr-3">
          أتعهد أنا ولي أمر الطالب / ابني (في حال قبوله في المدرسة) بالالتزام
          بأنظمة ولوائح المدرسة المرفقة بهذه الاستمارة.
        </p>
        <p className="text-sm text-gray-600 leading-relaxed border-r-4 border-[#04CDF9] pr-3">
          بتوقيعي هنا، أعتبر نفسي مسؤولاً عن صحة المعلومات المذكورة أعلاه. وفي
          حال ثبوت عدم صحتها، أتحمل المسؤولية وأوافق على القرار الذي تتخذه إدارة
          المدرسة.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="اسم ولي الأمر">
            <input
              className={inputCls}
              value={data.signing.parentName}
              onChange={(e) => update("signing.parentName", e.target.value)}
            />
          </Field>
          <Field label="صلة القرابة">
            <input
              className={inputCls}
              value={data.signing.relationToStudent}
              onChange={(e) =>
                update("signing.relationToStudent", e.target.value)
              }
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2 sticky bottom-4 z-10">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={saving}
          data-testid="save-student-btn-bottom"
          className="rounded-lg bg-[#04CDF9] px-5 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60 shadow-sm"
        >
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
    </form>
  );
}
