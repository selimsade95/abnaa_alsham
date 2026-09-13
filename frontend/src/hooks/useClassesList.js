import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { downloadCsv, uploadCsv } from "@/lib/csv";

const DEFAULT_FILTERS = {
  grade: "",
  section: "",
  academicYear: "",
  teacherId: "",
  status: "",
};
const classColumns = [
  { label: "الكود", value: (c) => c.code },
  { label: "الاسم", value: (c) => c.name },
  { label: "الصف", value: (c) => c.grade },
  { label: "الشعبة", value: (c) => c.section },
  { label: "السنة", value: (c) => c.academicYear },
  { label: "المعلم", value: (c) => c.teacherName },
  { label: "الحالة", value: (c) => c.status },
  { label: "سبب التعطيل", value: (c) => c.deactivationReason },
];
const classTemplate = [
  "name",
  "grade",
  "section",
  "academicYear",
  "teacherIds [comma-separated existing teacher IDs]",
  "capacity",
  "status [active|inactive]",
  "notes",
];

export function useClassesList() {
  const { has } = useAuth();
  const [items, setItems] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [debQ, setDebQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [reactivating, setReactivating] = useState(null);
  const importRef = useRef(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = { page, limit: 50, ...(debQ ? { search: debQ } : {}) };
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params[key] = value;
        });
        const response = await api.get("/classes", { params });
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
    api
      .get("/teachers", { params: { limit: 500 } })
      .then((response) => setTeachers(response.data.data))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load(1);
  }, [load]);

  const exportClasses = async () => {
    try {
      const params = { page: 1, limit: 5000, search: debQ, ...filters };
      Object.keys(params).forEach((key) => !params[key] && delete params[key]);
      const response = await api.get("/classes", { params });
      downloadCsv("classes.csv", classColumns, response.data.data);
    } catch {
      toast.error("تعذر تصدير الصفوف");
    }
  };
  const importClasses = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const response = await uploadCsv(api, "/classes/import", file);
      toast.success(`تم استيراد ${response.data.created} صف`);
      load(1);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر استيراد الصفوف");
    }
  };
  const openNew = () =>
    setEditing({
      id: null,
      name: "",
      grade: "",
      section: "",
      academicYear: "",
      teacherIds: [],
      capacity: 0,
      status: "active",
      notes: "",
    });
  const openEdit = (item) =>
    setEditing({
      ...item,
      teacherIds: item.teacherIds || (item.teacherId ? [item.teacherId] : []),
    });
  const save = async (event) => {
    event.preventDefault();
    const {
      id,
      code,
      createdAt,
      updatedAt,
      teacherName,
      teacherCode,
      studentCount,
      ...rest
    } = editing;
    const body = {
      ...rest,
      teacherIds: rest.teacherIds || [],
      teacherId: (rest.teacherIds || [])[0] || null,
      capacity: Number(rest.capacity) || 0,
    };
    try {
      if (id) await api.put(`/classes/${id}`, body);
      else await api.post("/classes", body);
      toast.success("تم الحفظ");
      setEditing(null);
      load(pagination.page);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل الحفظ");
    }
  };
  const doDelete = async () => {
    if (!confirmId || !deactivationReason.trim()) return;
    try {
      await api.delete(`/classes/${confirmId}`, {
        data: { reason: deactivationReason.trim() },
      });
      toast.success("تم تعطيل الصف");
      setConfirmId(null);
      load(pagination.page);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل تعطيل الصف");
    }
  };
  const doReactivate = async (id) => {
    setReactivating(id);
    try {
      await api.post(`/classes/${id}/reactivate`);
      toast.success("تم إعادة تفعيل الصف");
      load(pagination.page);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل إعادة تفعيل الصف");
    } finally {
      setReactivating(null);
    }
  };
  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  return {
    has,
    items,
    teachers,
    pagination,
    loading,
    q,
    setQ,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    editing,
    setEditing,
    confirmId,
    setConfirmId,
    deactivationReason,
    setDeactivationReason,
    reactivating,
    importRef,
    exportClasses,
    importClasses,
    openNew,
    openEdit,
    save,
    doDelete,
    doReactivate,
    clearFilters,
    classTemplate,
    hasActiveFilters: Object.values(filters).some(Boolean),
    load,
  };
}
