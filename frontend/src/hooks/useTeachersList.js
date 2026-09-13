import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { downloadCsv, uploadCsv } from "@/lib/csv";

const DEFAULT_FILTERS = {
  gender: "",
  employmentStatus: "",
  specialization: "",
};
const teacherColumns = [
  { label: "الكود", value: (t) => t.code },
  { label: "الاسم", value: (t) => t.fullName },
  { label: "الجنس", value: (t) => t.gender },
  { label: "الهاتف", value: (t) => t.phone },
  { label: "التخصص", value: (t) => t.specialization },
  { label: "الحالة", value: (t) => t.employmentStatus },
  { label: "سبب التعطيل", value: (t) => t.deactivationReason },
];
const teacherTemplate = [
  "fullName",
  "gender [male|female]",
  "phone",
  "address",
  "specialization",
  "qualification",
  "employmentStatus [active|inactive]",
  "notes",
];

export function useTeachersList() {
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
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [reactivating, setReactivating] = useState(null);
  const importRef = useRef(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = { page, limit: 20, ...(debQ ? { search: debQ } : {}) };
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params[key] = value;
        });
        const response = await api.get("/teachers", { params });
        setItems(response.data.data);
        setPagination(response.data.pagination);
      } catch {
        toast.error("تعذر التحميل");
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

  const exportTeachers = async () => {
    try {
      const params = { page: 1, limit: 5000, search: debQ, ...filters };
      Object.keys(params).forEach((key) => !params[key] && delete params[key]);
      const response = await api.get("/teachers", { params });
      downloadCsv("teachers.csv", teacherColumns, response.data.data);
    } catch {
      toast.error("تعذر تصدير المعلمين");
    }
  };
  const importTeachers = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const response = await uploadCsv(api, "/teachers/import", file);
      toast.success(`تم استيراد ${response.data.created} معلم`);
      load(1);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر استيراد المعلمين");
    }
  };
  const doDelete = async () => {
    if (!confirmId || !deactivationReason.trim()) return;
    try {
      await api.delete(`/teachers/${confirmId}`, {
        data: { reason: deactivationReason.trim() },
      });
      toast.success("تم تعطيل المعلم");
      setConfirmId(null);
      load(pagination.page);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل تعطيل المعلم");
    }
  };
  const doReactivate = async (id) => {
    setReactivating(id);
    try {
      await api.post(`/teachers/${id}/reactivate`);
      toast.success("تم إعادة تفعيل المعلم");
      load(pagination.page);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل إعادة تفعيل المعلم");
    } finally {
      setReactivating(null);
    }
  };
  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  return {
    has,
    nav,
    items,
    pagination,
    loading,
    q,
    setQ,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    confirmId,
    setConfirmId,
    deactivationReason,
    setDeactivationReason,
    reactivating,
    importRef,
    exportTeachers,
    importTeachers,
    doDelete,
    doReactivate,
    clearFilters,
    teacherTemplate,
    hasActiveFilters: Object.values(filters).some(Boolean),
    load,
  };
}
