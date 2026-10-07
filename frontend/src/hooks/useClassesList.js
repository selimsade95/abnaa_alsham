import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { downloadCsv, uploadCsv } from "@/lib/csv";
import {
  persistSessionStorageValue,
  useSessionStorageState,
} from "@/hooks/useSessionStorageState";

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
  const [savedPage, setSavedPage] = useSessionStorageState(
    "classes-list-page",
    1,
  );
  const [pagination, setPagination] = useState({
    page: savedPage,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useSessionStorageState("classes-list-search", "");
  const [debQ, setDebQ] = useState(q.trim());
  const [showFilters, setShowFilters] = useSessionStorageState(
    "classes-list-show-filters",
    false,
  );
  const [filters, setFilters] = useSessionStorageState(
    "classes-list-filters",
    DEFAULT_FILTERS,
  );
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [reactivating, setReactivating] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const importRef = useRef(null);
  const currentPage = useRef(Math.max(1, Number(savedPage) || 1));

  const load = useCallback(
    async (page = 1) => {
      currentPage.current = page;
      setSavedPage(page);
      persistSessionStorageValue("classes-list-page", page);
      setLoading(true);
      try {
        const params = { page, limit: 50, ...(debQ ? { search: debQ } : {}) };
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params[key] = value;
        });
        let response = await api.get("/classes", { params });
        const lastPage = Math.max(
          1,
          response.data.pagination?.totalPages || 1,
        );
        if (page > lastPage) {
          page = lastPage;
          currentPage.current = page;
          params.page = page;
          setSavedPage(page);
          persistSessionStorageValue("classes-list-page", page);
          response = await api.get("/classes", { params });
        }
        setItems(response.data.data);
        setPagination(response.data.pagination);
      } catch {
        toast.error("تعذر التحميل");
      } finally {
        setLoading(false);
      }
    },
    [debQ, filters, setSavedPage],
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
    load(currentPage.current);
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
  const openPromotion = async (sourceClass) => {
    setPromotionLoading(true);
    try {
      const [studentsResponse, classesResponse] = await Promise.all([
        api.get("/students", { params: { classId: sourceClass.id, limit: 5000 } }),
        api.get("/classes", { params: { status: "active", limit: 500 } }),
      ]);
      setPromotion({
        sourceClass,
        destinationClassId: "",
        destinations: (classesResponse.data.data || []).filter(
          (item) => item.id !== sourceClass.id && item.status === "active",
        ),
        students: (studentsResponse.data.data || []).map((student) => ({
          ...student,
          selected: false,
          newTotalPayable: Number(student.fees?.totalPayable || 0),
        })),
      });
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر تحميل طلاب الصف");
    } finally {
      setPromotionLoading(false);
    }
  };
  const updatePromotion = (update) =>
    setPromotion((previous) => ({ ...previous, ...update }));
  const updatePromotionStudent = (studentId, update) =>
    setPromotion((previous) => ({
      ...previous,
      students: previous.students.map((student) =>
        student.id === studentId ? { ...student, ...update } : student,
      ),
    }));
  const submitPromotion = async () => {
    if (!promotion?.destinationClassId) {
      toast.error("اختر الصف الجديد");
      return;
    }
    const selectedStudents = promotion.students.filter((student) => student.selected);
    if (!selectedStudents.length) {
      toast.error("اختر طالباً واحداً على الأقل");
      return;
    }
    if (selectedStudents.some((student) =>
      !Number.isFinite(Number(student.newTotalPayable)) || Number(student.newTotalPayable) < 0,
    )) {
      toast.error("أدخل مستحقاً جديداً صالحاً لكل طالب محدد");
      return;
    }
    setPromotionSaving(true);
    try {
      const response = await api.post(
        `/classes/${promotion.sourceClass.id}/promote-students`,
        {
          destinationClassId: promotion.destinationClassId,
          students: selectedStudents.map((student) => ({
            studentId: student.id,
            totalPayable: Number(student.newTotalPayable),
          })),
        },
      );
      toast.success(`تم ترفيع ${response.data.moved} طالب`);
      setPromotion(null);
      load(pagination.page);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر ترفيع الطلاب");
    } finally {
      setPromotionSaving(false);
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
    promotion,
    promotionLoading,
    promotionSaving,
    openPromotion,
    updatePromotion,
    updatePromotionStudent,
    submitPromotion,
    setPromotion,
    clearFilters,
    classTemplate,
    hasActiveFilters: Object.values(filters).some(Boolean),
    load,
  };
}
