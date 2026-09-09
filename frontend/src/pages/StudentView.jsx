import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { API } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowRight,
  Pencil,
  Trash2,
  Printer,
  Loader2,
  Plus,
  Upload,
  Download,
  FileText,
  X,
} from "lucide-react";
import {
  STATUS_LABELS,
  GENDER_LABELS,
  ORPHAN_OF_LABELS,
  ORPHAN_DOC_TYPES,
  SEMESTER_LABELS,
} from "@/lib/studentDefaults";
import { useAuth } from "@/lib/auth";

const Section = ({ title, children, actions }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {actions}
    </div>
    <div>{children}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex flex-wrap gap-2 py-1.5">
    <div className="text-sm text-gray-500 w-40">{label}</div>
    <div className="text-sm text-gray-900 font-medium flex-1 min-w-0 break-words">
      {value || <span className="text-gray-400">—</span>}
    </div>
  </div>
);

const StatusBadge = ({ paid, total }) => {
  const remaining = total - paid;
  if (total > 0 && remaining <= 0)
    return (
      <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        مسدَّد بالكامل
      </span>
    );
  if (paid > 0)
    return (
      <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        دفع جزئي
      </span>
    );
  return (
    <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
      غير مدفوع
    </span>
  );
};

export default function StudentView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { has } = useAuth();
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [payModal, setPayModal] = useState(null);
  const [uploadModal, setUploadModal] = useState(false);
  const [docConfirm, setDocConfirm] = useState(false);
  const fileRef = useRef(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/students/${id}`),
      has("payments.view")
        ? api.get(`/students/${id}/payments`)
        : Promise.resolve({ data: [] }),
    ])
      .then(([s, p]) => {
        setData(s.data);
        setPayments(p.data);
      })
      .catch(() => toast.error("تعذر تحميل بيانات الطالب"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [id]);

  const doDelete = async () => {
    if (!deactivationReason.trim()) return;
    try {
      await api.delete(`/students/${id}`, {
        data: { reason: deactivationReason.trim() },
      });
      toast.success("تم تعطيل الطالب");
      nav("/students");
    } catch {
      toast.error("تعذر تعطيل الطالب");
    }
  };

  const openAddPayment = () =>
    setPayModal({
      id: null,
      student: id,
      academicYear: data.fees?.academicYear || "",
      semester: "full_year",
      amount: "",
      paymentDate: new Date().toISOString().slice(0, 10),
      notes: "",
    });
  const openEditPayment = (p) =>
    setPayModal({ ...p, paymentDate: (p.paymentDate || "").slice(0, 10) });

  const savePayment = async (e) => {
    e.preventDefault();
    try {
      const body = {
        student: payModal.student,
        academicYear: payModal.academicYear,
        semester: payModal.semester,
        amount: Number(payModal.amount),
        paymentDate: payModal.paymentDate,
        notes: payModal.notes || "",
      };
      if (payModal.id) await api.put(`/payments/${payModal.id}`, body);
      else await api.post("/payments", body);
      toast.success("تم الحفظ");
      setPayModal(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    }
  };

  const deletePayment = async (pid) => {
    if (!window.confirm("هل تريد حذف هذه الدفعة؟")) return;
    try {
      await api.delete(`/payments/${pid}`);
      toast.success("تم الحذف");
      load();
    } catch {
      toast.error("تعذر الحذف");
    }
  };

  const uploadDoc = async (e) => {
    e.preventDefault();
    const type = e.target.elements.namedItem("type").value;
    const description = e.target.elements.namedItem("description")?.value || "";
    const file = fileRef.current?.files?.[0];
    if (!file || !type) {
      toast.error("يرجى تعبئة الحقول");
      return;
    }
    // if existing doc, backend replaces it. We ask here only if there was a previous file (already handled by prompt below)
    const fd = new FormData();
    fd.append("type", type);
    fd.append("description", description);
    fd.append("file", file);
    try {
      await api.post(`/students/${id}/orphan-document`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("تم رفع الوثيقة");
      setUploadModal(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الرفع");
    }
  };

  const openUpload = () => {
    if (data?.orphanDocument) {
      if (!window.confirm("توجد وثيقة سابقة. هل تريد استبدالها؟")) return;
    }
    setUploadModal(true);
  };

  const deleteDoc = async () => {
    try {
      await api.delete(`/students/${id}/orphan-document`);
      toast.success("تم حذف الوثيقة");
      setDocConfirm(false);
      load();
    } catch {
      toast.error("تعذر الحذف");
    }
  };

  const downloadDoc = async () => {
    try {
      const res = await api.get(`/students/${id}/orphan-document`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.orphanDocument?.originalName || "orphan-document";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("تعذر تنزيل الوثيقة");
    }
  };

  if (loading)
    return (
      <div className="text-center text-gray-500 py-16">
        <Loader2 className="inline h-4 w-4 animate-spin ms-2" /> جاري التحميل...
      </div>
    );
  if (!data) return null;

  const s = data.student || {};
  const f = data.father || {};
  const m = data.mother || {};
  const fees = data.fees || {};

  return (
    <div className="space-y-6">
      {s.status === "inactive" && data.deactivationReason && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
          data-testid="student-deactivation-alert"
        >
          <span className="font-bold">الطالب غير نشط.</span> سبب التعطيل:{" "}
          {data.deactivationReason}
        </div>
      )}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => nav("/students")}
            className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-2"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{s.fullName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            كود: <span className="font-mono">{data.code || "—"}</span> •{" "}
            {GENDER_LABELS[s.gender]} • {STATUS_LABELS[s.status]} • مسار:{" "}
            {s.registrationPath || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {has("students.fullInformation.view") && (
            <button
              onClick={() => nav(`/students/${id}/full-information`)}
              data-testid="view-fullinfo-btn"
              className="inline-flex items-center gap-2 rounded-lg border border-[#04CDF9] bg-brand-light text-[#036A87] px-3 py-2 text-sm hover:bg-brand-light/70"
            >
              المعلومات الكاملة
            </button>
          )}
          {has("students.print") && (
            <button
              onClick={() => window.open(`/students/${id}/print`, "_blank")}
              data-testid="view-print-btn"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Printer className="h-4 w-4" /> طباعة
            </button>
          )}
          {has("students.print") && (
            <button
              onClick={() => window.open(`/students/${id}/card`, "_blank")}
              data-testid="view-card-btn"
              className="inline-flex items-center gap-2 rounded-lg border border-[#04CDF9] bg-brand-light text-[#036A87] px-3 py-2 text-sm hover:bg-brand-light/70"
            >
              بطاقة الطالب
            </button>
          )}
          {has("students.update") && (
            <button
              onClick={() => nav(`/students/${id}/edit`)}
              data-testid="view-edit-btn"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-4 w-4" /> تعديل
            </button>
          )}
          {has("students.delete") && (
            <button
              onClick={() => {
                setDeactivationReason("");
                setConfirm(true);
              }}
              data-testid="view-delete-btn"
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" /> تعطيل
            </button>
          )}
        </div>
      </div>

      <Section title="معلومات الطالب">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Row label="الاسم الكامل" value={s.fullName} />
          <Row label="تاريخ الميلاد" value={s.birthdate?.slice(0, 10)} />
          <Row label="مكان الميلاد" value={s.birthPlace} />
          <Row label="الجنس" value={GENDER_LABELS[s.gender]} />
          <Row label="مسار التسجيل" value={s.registrationPath} />
          <Row label="الصف السابق" value={s.previousClass} />
          <Row label="الصف الجديد" value={s.newClass} />
          <Row label="الوضع" value={STATUS_LABELS[s.status]} />
          <Row
            label="يتيم"
            value={
              s.orphan ? `نعم — ${ORPHAN_OF_LABELS[s.orphanOf] || "—"}` : "لا"
            }
          />
          {s.orphan && <Row label="نوع وثيقة اليتم" value={s.orphanDocType} />}
          <Row label="العنوان الحالي" value={s.currentAddress} />
          <Row label="اللغات" value={(s.languages || []).join("، ")} />
          <Row label="الهوايات" value={(s.hobbies || []).join("، ")} />
          <Row
            label="أمراض مزمنة"
            value={s.chronicDisease ? s.chronicDiseaseDetails || "نعم" : "لا"}
          />
          <Row
            label="عادات دائمة"
            value={s.permanentHabits ? s.permanentHabitsDetails || "نعم" : "لا"}
          />
        </div>
      </Section>

      {s.orphan && (
        <Section
          title="وثيقة اليتم"
          actions={
            <div className="flex items-center gap-2">
              {has("students.orphanDocument.upload") && (
                <button
                  onClick={openUpload}
                  data-testid="orphan-upload-btn"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <Upload className="h-3.5 w-3.5" />{" "}
                  {data.orphanDocument ? "استبدال" : "رفع"}
                </button>
              )}
              {data.orphanDocument && has("students.orphanDocument.delete") && (
                <button
                  onClick={() => setDocConfirm(true)}
                  data-testid="orphan-delete-btn"
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-1.5 text-xs hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" /> حذف
                </button>
              )}
            </div>
          }
        >
          {data.orphanDocument ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-brand-light text-[#036A87] flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {data.orphanDocument.originalName ||
                      data.orphanDocument.fileName}
                  </div>
                  <div className="text-xs text-gray-500">
                    {data.orphanDocument.type} •{" "}
                    {Math.round((data.orphanDocument.size || 0) / 1024)}{" "}
                    كيلوبايت
                  </div>
                </div>
              </div>
              {has("students.orphanDocument.view") && (
                <button
                  onClick={downloadDoc}
                  data-testid="orphan-download-btn"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" /> تنزيل
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">لم تُرفع وثيقة بعد.</p>
          )}
        </Section>
      )}

      {has("payments.view") && (
        <Section
          title="رسوم التسجيل"
          actions={
            <div className="flex items-center gap-2">
              {has("payments.print") && (
                <button
                  onClick={() =>
                    window.open(`/students/${id}/payments/print`, "_blank")
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <Printer className="h-3.5 w-3.5" /> طباعة السجل
                </button>
              )}
              <StatusBadge
                paid={fees.totalPaid || 0}
                total={fees.totalPayable || 0}
              />
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500 mb-1">السنة الدراسية</div>
              <div className="text-sm font-semibold text-gray-900">
                {fees.academicYear || "—"}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500 mb-1">إجمالي المستحق</div>
              <div className="text-sm font-semibold text-gray-900 tabular-nums">
                {(fees.totalPayable || 0).toLocaleString("ar-EG")}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500 mb-1">المدفوع</div>
              <div className="text-sm font-semibold text-emerald-700 tabular-nums">
                {(fees.totalPaid || 0).toLocaleString("ar-EG")}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-xs text-gray-500 mb-1">المتبقي</div>
              <div className="text-sm font-semibold text-amber-700 tabular-nums">
                {(fees.remaining || 0).toLocaleString("ar-EG")}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">سجل المدفوعات</h4>
            {has("payments.create") && (
              <button
                onClick={openAddPayment}
                data-testid="student-add-payment-btn"
                className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#03A9D1]"
              >
                <Plus className="h-3.5 w-3.5" /> إضافة دفعة
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-right">التاريخ</th>
                  <th className="px-3 py-2 text-right">السنة</th>
                  <th className="px-3 py-2 text-right">الفصل</th>
                  <th className="px-3 py-2 text-right">المبلغ</th>
                  <th className="px-3 py-2 text-right">سُجّل بواسطة</th>
                  <th className="text-left px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-4 text-center text-gray-500"
                    >
                      لا توجد مدفوعات مسجلة.
                    </td>
                  </tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600">
                      {(p.paymentDate || "").slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {p.academicYear}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {SEMESTER_LABELS[p.semester]}
                    </td>
                    <td className="px-3 py-2 font-semibold text-gray-900 tabular-nums">
                      {p.amount}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {p.createdByName}
                    </td>
                    <td className="px-3 py-2 text-left">
                      <div className="inline-flex gap-1">
                        {has("payments.update") && (
                          <button
                            onClick={() => openEditPayment(p)}
                            data-testid={`edit-payment-${p.id}`}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {has("payments.print") && (
                          <button
                            onClick={() =>
                              window.open(`/payments/${p.id}/print`, "_blank")
                            }
                            title="طباعة الإيصال"
                            className="p-1.5 rounded-md text-[#036A87] hover:bg-brand-light"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        )}
                        {has("payments.delete") && (
                          <button
                            onClick={() => deletePayment(p.id)}
                            data-testid={`delete-payment-${p.id}`}
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="الإخوة">
        {data.siblings?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-right">#</th>
                  <th className="px-3 py-2 text-right">الاسم الكامل</th>
                  <th className="px-3 py-2 text-right">الجنس</th>
                  <th className="px-3 py-2 text-right">الصف</th>
                </tr>
              </thead>
              <tbody>
                {data.siblings.map((sib, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600">{sib.order}</td>
                    <td className="px-3 py-2 text-gray-900">{sib.fullName}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {GENDER_LABELS[sib.gender]}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{sib.class}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">لا يوجد إخوة مسجلون.</p>
        )}
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="الأب">
          <Row label="الاسم" value={f.name} />
          <Row label="الحالة" value={f.alive ? "على قيد الحياة" : "متوفى"} />
          <Row label="الهاتف" value={f.phone} />
          <Row label="العنوان" value={f.address} />
          <Row label="المهنة" value={f.profession} />
          <Row label="واتساب" value={f.whatsapp} />
          <Row label="تلغرام" value={f.telegram} />
        </Section>
        <Section title="الأم">
          <Row label="الاسم" value={m.name} />
          <Row label="الحالة" value={m.alive ? "على قيد الحياة" : "متوفى"} />
          <Row label="الهاتف" value={m.phone} />
          <Row label="العنوان" value={m.address} />
          <Row label="المهنة" value={m.profession} />
          <Row label="واتساب" value={m.whatsapp} />
          <Row label="تلغرام" value={m.telegram} />
        </Section>
      </div>

      <Section title="معلومات عامة">
        <Row label="واتساب المدرسة" value={data.general?.whatsappGroupPhone} />
        <Row
          label="جهة الطوارئ"
          value={[
            data.general?.emergencyContact?.name,
            data.general?.emergencyContact?.relation,
            data.general?.emergencyContact?.phone,
          ]
            .filter(Boolean)
            .join(" • ")}
        />
      </Section>

      {data.previousEducation?.length > 0 && (
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
                </tr>
              </thead>
              <tbody>
                {data.previousEducation.map((e, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2">{e.classes}</td>
                    <td className="px-3 py-2">{e.schoolName}</td>
                    <td className="px-3 py-2">{e.startingDate}</td>
                    <td className="px-3 py-2">{e.endingDate}</td>
                    <td className="px-3 py-2">{e.results}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {data.islamicLegalEducation && (
        <Section title="التعليم الشرعي">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {data.islamicLegalEducation}
          </p>
        </Section>
      )}
      {data.bestAchievement && (
        <Section title="أفضل إنجاز">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {data.bestAchievement}
          </p>
        </Section>
      )}

      <Section title="معلومات أخرى">
        <Row
          label="مدخنون في الأسرة"
          value={data.otherInfo?.familySmokers ? "نعم" : "لا"}
        />
        <Row
          label="طريقة الوصول للمدرسة"
          value={data.otherInfo?.transportation}
        />
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-medium text-amber-800 mb-1">
            ملاحظات داخلية (لن تُطبع)
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">
            {data.otherInfo?.notes || "لا توجد ملاحظات."}
          </p>
        </div>
      </Section>

      <Section title="التوقيع">
        <Row label="اسم ولي الأمر" value={data.signing?.parentName} />
        <Row label="صلة القرابة" value={data.signing?.relationToStudent} />
      </Section>

      {/* Delete student modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              تأكيد التعطيل
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              سيبقى الطالب وبياناته محفوظين، لكنه لن يظهر في القوائم العادية.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              سبب التعطيل <span className="text-red-500">*</span>
            </label>
            <textarea
              value={deactivationReason}
              onChange={(e) => setDeactivationReason(e.target.value)}
              required
              rows={3}
              data-testid="view-deactivation-reason-input"
              placeholder="اكتب سبب تعطيل الطالب"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-6"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setConfirm(false);
                  setDeactivationReason("");
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={doDelete}
                disabled={!deactivationReason.trim()}
                data-testid="view-confirm-delete-btn"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                تعطيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {payModal.id ? "تعديل دفعة" : "إضافة دفعة"}
              </h3>
              <button
                onClick={() => setPayModal(null)}
                className="text-gray-500 hover:text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={savePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  السنة الدراسية
                </label>
                <input
                  required
                  value={payModal.academicYear}
                  onChange={(e) =>
                    setPayModal({ ...payModal, academicYear: e.target.value })
                  }
                  placeholder="2026-2027"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]"
                  data-testid="stu-pay-year"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الفصل
                </label>
                <select
                  value={payModal.semester}
                  onChange={(e) =>
                    setPayModal({ ...payModal, semester: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]"
                  data-testid="stu-pay-semester"
                >
                  <option value="first">الفصل الأول</option>
                  <option value="second">الفصل الثاني</option>
                  <option value="full_year">السنة كاملة</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المبلغ
                  </label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={payModal.amount}
                    onChange={(e) =>
                      setPayModal({ ...payModal, amount: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]"
                    data-testid="stu-pay-amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    التاريخ
                  </label>
                  <input
                    required
                    type="date"
                    value={payModal.paymentDate}
                    onChange={(e) =>
                      setPayModal({ ...payModal, paymentDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  value={payModal.notes}
                  onChange={(e) =>
                    setPayModal({ ...payModal, notes: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModal(null)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  data-testid="stu-pay-submit"
                  className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload doc modal */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              رفع وثيقة اليتم
            </h3>
            <form onSubmit={uploadDoc} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  النوع
                </label>
                <select
                  name="type"
                  required
                  defaultValue={s.orphanDocType || ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]"
                  data-testid="orphan-doc-type"
                >
                  <option value="">— اختر —</option>
                  {ORPHAN_DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الوصف (اختياري)
                </label>
                <input
                  name="description"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#04CDF9]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الملف (PDF/JPG/PNG - أقل من 10MB)
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="w-full text-sm"
                  data-testid="orphan-doc-file"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModal(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  data-testid="orphan-doc-submit"
                  className="rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
                >
                  رفع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {docConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              حذف الوثيقة
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              هل تريد حذف وثيقة اليتم؟
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDocConfirm(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={deleteDoc}
                data-testid="orphan-doc-confirm-delete"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
