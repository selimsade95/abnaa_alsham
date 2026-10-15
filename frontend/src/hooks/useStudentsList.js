import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useClasses } from "@/hooks/useClasses";
import { downloadCsv, downloadTemplate, uploadCsv } from "@/lib/csv";
import { REGISTRATION_PATHS } from "@/lib/studentDefaults";
import {
  persistSessionStorageValue,
  useSessionStorageState,
} from "@/hooks/useSessionStorageState";

const DEFAULT_FILTERS = {
  gender: "",
  orphan: "",
  registrationPath: "",
  classId: "",
  status: "",
  academicYear: "",
  paymentStatus: "",
  finalRegistrationPath: "",
};

const studentColumns = [
  { label: "fullName", value: (s) => s.student?.fullName },
  { label: "gender", value: (s) => s.student?.gender },
  { label: "birthdate", value: (s) => s.student?.birthdate },
  { label: "registrationPath", value: (s) => s.student?.registrationPath },
  {
    label: "finalRegistrationPath",
    value: (s) => s.student?.finalRegistrationPath,
  },
  {
    label: "newClass",
    value: (s) => s.student?.newClass || s.currentClass?.name,
  },
  { label: "currentAddress", value: (s) => s.student?.currentAddress },
  { label: "orphan", value: (s) => Boolean(s.student?.orphan) },
  { label: "orphanOf", value: (s) => s.student?.orphanOf },
  { label: "orphanDocType", value: (s) => s.student?.orphanDocType },
  { label: "fatherName", value: (s) => s.father?.name },
  { label: "fatherDeceased", value: (s) => s.father?.alive === false },
  { label: "motherName", value: (s) => s.mother?.name },
  { label: "motherPhone", value: (s) => s.mother?.phone },
  { label: "academicYear", value: (s) => s.fees?.academicYear },
  { label: "academicFee", value: (s) => s.fees?.totalPayable },
  { label: "academicPaid", value: (s) => s.fees?.byType?.academic?.paid },
  {
    label: "discountPercentage",
    value: (s) => s.fees?.discountPercentage,
  },
  { label: "booksFee", value: (s) => s.fees?.booksFee },
  { label: "booksPaid", value: (s) => s.fees?.byType?.books?.paid },
  { label: "busFee", value: (s) => s.fees?.busFee },
  { label: "busPaid", value: (s) => s.fees?.byType?.transportation?.paid },
  { label: "busNo", value: (s) => s.student?.busNumber },
  { label: "dropped", value: (s) => s.student?.status === "inactive" },
];

const studentTemplate = [
  "fullName",
  "gender",
  "birthdate",
  "registrationPath",
  "finalRegistrationPath",
  "newClass",
  "currentAddress",
  "orphan",
  "orphanOf",
  "orphanDocType",
  "fatherName",
  "fatherDeceased",
  "motherName",
  "motherPhone",
  "academicYear",
  "academicFee",
  "academicPaid",
  "discountPercentage",
  "booksFee",
  "booksPaid",
  "busFee",
  "busPaid",
  "busNo",
  "dropped",
];

export function useStudentsList() {
  const { has } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [registrationPaths, setRegistrationPaths] =
    useState(REGISTRATION_PATHS);
  const [summary, setSummary] = useState({
    totalPayable: 0,
    totalPaid: 0,
    totalRemaining: 0,
    totalBooksFee: 0,
    totalBusFee: 0,
    totalOutfitFee: 0,
  });
  const [savedPage, setSavedPage] = useSessionStorageState(
    "students-list-page",
    1,
  );
  const [pagination, setPagination] = useState({
    page: savedPage,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useSessionStorageState("students-list-search", "");
  const [debQ, setDebQ] = useState(q.trim());
  const [showFilters, setShowFilters] = useSessionStorageState(
    "students-list-show-filters",
    false,
  );
  const [filters, setFilters] = useSessionStorageState(
    "students-list-filters",
    DEFAULT_FILTERS,
  );
  const { classes } = useClasses({ limit: 500 }, has("classes.view"));
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState(null);
  const importRef = useRef(null);
  const currentPage = useRef(Math.max(1, Number(savedPage) || 1));

  useEffect(() => {
    api
      .get("/registration-paths")
      .then((response) => setRegistrationPaths(response.data.paths || []))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (page = 1) => {
      currentPage.current = page;
      setSavedPage(page);
      persistSessionStorageValue("students-list-page", page);
      setLoading(true);
      try {
        const params = { page, limit: 20 };
        if (debQ) params.search = debQ;
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params[key] = value;
        });
        let response = await api.get("/students", { params });
        const lastPage = Math.max(1, response.data.pagination?.totalPages || 1);
        if (page > lastPage) {
          page = lastPage;
          currentPage.current = page;
          params.page = page;
          setSavedPage(page);
          persistSessionStorageValue("students-list-page", page);
          response = await api.get("/students", { params });
        }
        setItems(response.data.data);
        setSummary(
          response.data.summary || {
            totalPayable: 0,
            totalPaid: 0,
            totalRemaining: 0,
            totalBooksFee: 0,
            totalBusFee: 0,
            totalOutfitFee: 0,
          },
        );
        setPagination(response.data.pagination);
      } catch {
        toast.error("تعذر تحميل الطلاب");
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
    load(currentPage.current);
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
    registrationPaths,
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
