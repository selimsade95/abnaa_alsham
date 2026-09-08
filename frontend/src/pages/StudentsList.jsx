import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import {
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  Printer,
  Loader2,
  Filter,
  FileText,
  Download,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  STATUS_LABELS,
  GENDER_LABELS,
  REGISTRATION_PATHS,
} from "@/lib/studentDefaults";
import { useAuth } from "@/lib/auth";
import { downloadCsv, downloadTemplate, uploadCsv } from "@/lib/csv";

export default function StudentsList() {
  const { has } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    gender: "",
    orphan: "",
    registrationPath: "",
    classId: "",
    status: "",
    academicYear: "",
    paymentStatus: "",
  });
  const [classes, setClasses] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState(null);
  const importRef = useRef(null);

  const studentColumns = [
    { label: "الكود", value: (s) => s.code },
    { label: "الاسم الكامل", value: (s) => s.student?.fullName },
    { label: "الجنس", value: (s) => s.student?.gender },
    { label: "تاريخ الميلاد", value: (s) => s.student?.birthdate },
    { label: "الحالة", value: (s) => s.student?.status },
    {
      label: "الصف",
      value: (s) => s.currentClass?.name || s.student?.newClass,
    },
    { label: "مسار التسجيل", value: (s) => s.student?.registrationPath },
    { label: "الهاتف", value: (s) => s.father?.phone || s.mother?.phone },
    { label: "سبب التعطيل", value: (s) => s.deactivationReason },
  ];
  const studentTemplate = [
    "fullName",
    "gender [male|female]",
    "birthdate",
    "registrationPath [خاص|القرية|الايتام]",
    "status [resident|immigrant|displaced|inactive]",
    "currentAddress",
    "fatherName",
    "fatherPhone",
    "motherName",
    "motherPhone",
    "academicYear",
    "totalPayable",
    "currentClassId [existing class ID]",
  ];

  const exportStudents = async () => {
    try {
      const params = { page: 1, limit: 5000, search: debQ, ...filters };
      Object.keys(params).forEach((key) => !params[key] && delete params[key]);
      const response = await api.get("/students", { params });
      downloadCsv("students.csv", studentColumns, response.data.data);
    } catch {
      toast.error("تعذر تصدير الطلاب");
    }
  };
  const importStudents = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const response = await uploadCsv(api, "/students/import", file);
      toast.success(`تم استيراد ${response.data.created} طالب`);
      load(1);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر استيراد الطلاب");
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (has("classes.view"))
      api
        .get("/classes", { params: { limit: 500 } })
        .then((r) => setClasses(r.data.data))
        .catch(() => {}); /* eslint-disable-next-line */
  }, []);

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 20 };
      if (debQ) params.search = debQ;
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const r = await api.get("/students", { params });
      setItems(r.data.data);
      setPagination(r.data.pagination);
    } catch {
      toast.error("تعذر تحميل الطلاب");
    }
    setLoading(false);
  };
  useEffect(() => {
    load(1); /* eslint-disable-next-line */
  }, [debQ, filters]);

  const doDelete = async () => {
    if (!confirmId || !deactivationReason.trim()) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${confirmId}`, {
        data: { reason: deactivationReason.trim() },
      });
      toast.success("تم تعطيل الطالب");
      setConfirmId(null);
      load(pagination.page);
    } catch {
      toast.error("تعذر تعطيل الطالب");
    }
    setDeleting(false);
  };

  const doReactivate = async (id) => {
    setReactivating(id);
    try {
      await api.post(`/students/${id}/reactivate`);
      toast.success("تم إعادة تفعيل الطالب");
      load(pagination.page);
    } catch {
      toast.error("تعذر إعادة تفعيل الطالب");
    }
    setReactivating(null);
  };

  const clearFilters = () =>
    setFilters({
      gender: "",
      orphan: "",
      registrationPath: "",
      classId: "",
      status: "",
      academicYear: "",
      paymentStatus: "",
    });
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">الطلاب</h1>
          <p className="text-sm text-gray-500 mt-1">جميع الطلاب المسجلين</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {has("students.create") && (
            <Link
              to="/students/new"
              data-testid="add-student-btn"
              className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
            >
              <Plus className="h-4 w-4" /> إضافة طالب
            </Link>
          )}
          {has("students.view") && (
            <button
              onClick={exportStudents}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <Download className="h-4 w-4" /> تصدير
            </button>
          )}
          {has("students.create") && (
            <>
              <button
                onClick={() =>
                  downloadTemplate("students-template.csv", studentTemplate)
                }
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <Download className="h-4 w-4" /> قالب الاستيراد
              </button>
              <button
                onClick={() => importRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-3 py-2 text-sm font-semibold text-white"
              >
                <Upload className="h-4 w-4" /> استيراد
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".csv,text/csv"
                onChange={importStudents}
                className="hidden"
              />
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              data-testid="students-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم / الكود / الهاتف / العنوان..."
              className="w-full rounded-lg border border-gray-300 pr-9 pl-3 py-2 text-sm focus:ring-2 focus:ring-[#04CDF9]"
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            data-testid="toggle-filters-btn"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${activeCount ? "border-[#04CDF9] text-[#036A87] bg-brand-light" : "border-gray-300 text-gray-700"}`}
          >
            <Filter className="h-4 w-4" /> فلاتر{" "}
            {activeCount > 0 && (
              <span className="rounded-full bg-[#04CDF9] text-white text-[10px] px-1.5">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="p-4 border-b border-gray-200 bg-gray-50 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الجنس</label>
              <select
                value={filters.gender}
                onChange={(e) =>
                  setFilters({ ...filters, gender: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                data-testid="filter-gender"
              >
                <option value="">الكل</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">يتيم</label>
              <select
                value={filters.orphan}
                onChange={(e) =>
                  setFilters({ ...filters, orphan: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                data-testid="filter-orphan"
              >
                <option value="">الكل</option>
                <option value="true">نعم</option>
                <option value="false">لا</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                مسار التسجيل
              </label>
              <select
                value={filters.registrationPath}
                onChange={(e) =>
                  setFilters({ ...filters, registrationPath: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">الكل</option>
                {REGISTRATION_PATHS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الصف</label>
              <select
                value={filters.classId}
                onChange={(e) =>
                  setFilters({ ...filters, classId: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">الكل</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.section ? `— ${c.section}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الوضع</label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">النشطون فقط</option>
                <option value="all">الكل</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                السنة الدراسية
              </label>
              <input
                value={filters.academicYear}
                onChange={(e) =>
                  setFilters({ ...filters, academicYear: e.target.value })
                }
                placeholder="2026-2027"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                حالة الدفع
              </label>
              <select
                value={filters.paymentStatus}
                onChange={(e) =>
                  setFilters({ ...filters, paymentStatus: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">الكل</option>
                <option value="unpaid">غير مدفوع</option>
                <option value="partial">دفع جزئي</option>
                <option value="paid">مسدَّد بالكامل</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <button
                onClick={clearFilters}
                className="text-sm text-[#036A87] hover:underline"
              >
                مسح الفلاتر
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-right">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">الاسم الكامل</th>
                <th className="px-4 py-3 font-medium">الجنس</th>
                <th className="px-4 py-3 font-medium">تاريخ الميلاد</th>
                <th className="px-4 py-3 font-medium">الصف</th>
                <th className="px-4 py-3 font-medium">مسار</th>
                <th className="px-4 py-3 font-medium">الوضع</th>
                <th className="px-4 py-3 font-medium">يتيم</th>
                <th className="px-4 py-3 font-medium text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    <Loader2 className="inline h-4 w-4 animate-spin ms-2" />{" "}
                    جاري التحميل...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-gray-500"
                    data-testid="students-empty"
                  >
                    لا توجد نتائج مطابقة.{" "}
                    <button
                      onClick={clearFilters}
                      className="text-[#036A87] hover:underline"
                    >
                      مسح الفلاتر
                    </button>
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-gray-100 hover:bg-gray-50"
                    data-testid={`student-row-${s.id}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {s.code || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.student?.fullName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {GENDER_LABELS[s.student?.gender] || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.student?.birthdate?.slice(0, 10) || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.currentClass?.name || s.student?.newClass || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.student?.registrationPath || "—"}
                    </td>
                    <td
                      className={`px-4 py-3 ${s.student?.status === "inactive" ? "text-red-600" : "text-gray-600"}`}
                    >
                      <div>{STATUS_LABELS[s.student?.status] || "—"}</div>
                      {s.student?.status === "inactive" &&
                        s.deactivationReason && (
                          <div
                            className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                            role="alert"
                          >
                            سبب التعطيل: {s.deactivationReason}
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      {s.student?.orphan ? (
                        <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          نعم
                        </span>
                      ) : (
                        <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
                          لا
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-start">
                        <button
                          onClick={() => nav(`/students/${s.id}`)}
                          data-testid={`view-btn-${s.id}`}
                          title="عرض"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {has("students.fullInformation.view") && (
                          <button
                            onClick={() =>
                              nav(`/students/${s.id}/full-information`)
                            }
                            data-testid={`fullinfo-btn-${s.id}`}
                            title="المعلومات الكاملة"
                            className="p-1.5 rounded-md text-[#036A87] hover:bg-brand-light"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        )}
                        {has("students.update") && (
                          <button
                            onClick={() => nav(`/students/${s.id}/edit`)}
                            data-testid={`edit-btn-${s.id}`}
                            title="تعديل"
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {has("students.print") && (
                          <button
                            onClick={() =>
                              window.open(`/students/${s.id}/print`, "_blank")
                            }
                            data-testid={`print-btn-${s.id}`}
                            title="طباعة"
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        )}
                        {s.student?.status === "inactive"
                          ? has("students.update") && (
                              <button
                                onClick={() => doReactivate(s.id)}
                                disabled={reactivating === s.id}
                                data-testid={`reactivate-btn-${s.id}`}
                                title="إعادة التفعيل"
                                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )
                          : has("students.delete") && (
                              <button
                                onClick={() => {
                                  setDeactivationReason("");
                                  setConfirmId(s.id);
                                }}
                                data-testid={`delete-btn-${s.id}`}
                                title="تعطيل"
                                className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              صفحة {pagination.page} من {pagination.totalPages} • الإجمالي{" "}
              {pagination.total}
            </div>
            <div className="flex gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
              >
                السابق
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => load(pagination.page + 1)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmId && (
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
              data-testid="deactivation-reason-input"
              placeholder="اكتب سبب تعطيل الطالب"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-6"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setConfirmId(null);
                  setDeactivationReason("");
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={doDelete}
                disabled={deleting || !deactivationReason.trim()}
                data-testid="confirm-delete-btn"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "جاري التعطيل..." : "تعطيل"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
