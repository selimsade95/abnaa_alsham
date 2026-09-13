import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useClasses } from "@/hooks/useClasses";
import { downloadCsv, downloadTemplate, uploadCsv } from "@/lib/csv";

const DEFAULT_FILTERS = {
  gender: "",
  orphan: "",
  registrationPath: "",
  classId: "",
  status: "",
  academicYear: "",
  paymentStatus: "",
};

const studentColumns = [
  { label: "الكود", value: (s) => s.code },
  { label: "الاسم الكامل", value: (s) => s.student?.fullName },
  { label: "الجنس", value: (s) => s.student?.gender },
  { label: "تاريخ الميلاد", value: (s) => s.student?.birthdate },
  { label: "الحالة", value: (s) => s.student?.status },
  { label: "الصف", value: (s) => s.currentClass?.name || s.student?.newClass },
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

export function useStudentsList() {
  const { has } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    totalPayable: 0,
    totalPaid: 0,
    totalRemaining: 0,
  });
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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const { classes } = useClasses({ limit: 500 }, has("classes.view"));
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState(null);
  const importRef = useRef(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = { page, limit: 20 };
        if (debQ) params.search = debQ;
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params[key] = value;
        });
        const response = await api.get("/students", { params });
        setItems(response.data.data);
        setSummary(
          response.data.summary || {
            totalPayable: 0,
            totalPaid: 0,
            totalRemaining: 0,
          },
        );
        setPagination(response.data.pagination);
      } catch {
        toast.error("تعذر تحميل الطلاب");
      } finally {
        setLoading(false);
      }
    },
    [debQ, filters],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    load(1);
  }, [load]);

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
    } finally {
      setDeleting(false);
    }
  };

  const doReactivate = async (id) => {
    setReactivating(id);
    try {
      await api.post(`/students/${id}/reactivate`);
      toast.success("تم إعادة تفعيل الطالب");
      load(pagination.page);
    } catch {
      toast.error("تعذر إعادة تفعيل الطالب");
    } finally {
      setReactivating(null);
    }
  };

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  return {
    has,
    nav,
    items,
    summary,
    pagination,
    loading,
    q,
    setQ,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    classes,
    confirmId,
    setConfirmId,
    deactivationReason,
    setDeactivationReason,
    deleting,
    reactivating,
    importRef,
    load,
    doDelete,
    doReactivate,
    clearFilters,
    exportStudents,
    importStudents,
    studentTemplate,
    activeCount: Object.values(filters).filter(Boolean).length,
  };
}
