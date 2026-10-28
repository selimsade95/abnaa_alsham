import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { uploadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/reportExport";
import {
  persistSessionStorageValue,
  useSessionStorageState,
} from "@/hooks/useSessionStorageState";

const DEFAULT_FILTERS = {
  gender: "",
  employmentStatus: "",
  specialization: "",
};
const teacherTemplate = [
  "fullName",
  "fatherName",
  "motherName",
  "birthPlace",
  "birthDate",
  "gender",
  "idNumber",
  "address",
  "martialStatus",
  "maleChildrenCount",
  "femaleChildrenCount",
  "workStartDate",
  "department",
  "office",
  "education",
  "volunteer(true/false)",
  "jobDescription",
  "skills",
  "contactPhone",
  "notes",
  "certificate(file)",
];

const getTeacherTemplateValue = (teacher, header) => {
  const key = header.replace(/\(.+\)$/, "");
  if (key === "contactPhone") return teacher.contactPhone || teacher.phone || "";
  if (key === "education") return teacher.education || teacher.qualification || "";
  if (key === "jobDescription")
    return teacher.jobDescription || teacher.specialization || "";
  if (key === "martialStatus")
    return teacher.martialStatus || teacher.maritalStatus || "";
  if (key === "certificate")
    return teacher.certificateFile?.originalName || teacher.certificate || "";
  return teacher[key] ?? "";
};

const cellText = (cell) => {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.result != null) return String(value.result);
    if (value.text != null) return String(value.text);
    if (Array.isArray(value.richText))
      return value.richText.map((part) => part.text || "").join("");
  }
  return cell.text || String(value);
};

const prepareTeacherImportFile = async (file) => {
  if (!/\.xlsx$/i.test(file.name)) return file;

  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("ملف Excel لا يحتوي على ورقة بيانات");

  const headers = worksheet
    .getRow(1)
    .values.slice(1)
    .map((value) => String(value ?? "").trim());
  if (!headers.some(Boolean)) throw new Error("قالب المعلمين غير صحيح");

  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [headers.map(csvCell).join(",")];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = headers.map((_, index) => cellText(row.getCell(index + 1)));
    if (values.some((value) => value.trim()))
      rows.push(values.map(csvCell).join(","));
  });
  return new File([`\ufeff${rows.join("\n")}`], file.name.replace(/\.xlsx$/i, ".csv"), {
    type: "text/csv;charset=utf-8",
  });
};

export function useTeachersList() {
  const { has } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const filterSearch = searchParams.toString();
  const initialFilterParams = new URLSearchParams(filterSearch);
  const hasInitialFilterParams =
    initialFilterParams.has("filterSource") ||
    initialFilterParams.has("gender") ||
    initialFilterParams.has("employmentStatus");
  const [syncedFilterSearch, setSyncedFilterSearch] = useState(() =>
    hasInitialFilterParams ? null : filterSearch,
  );
  const [items, setItems] = useState([]);
  const [savedPage, setSavedPage] = useSessionStorageState(
    "teachers-list-page",
    1,
  );
  const [pagination, setPagination] = useState({
    page: savedPage,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useSessionStorageState("teachers-list-search", "");
  const [debQ, setDebQ] = useState(q.trim());
  const [showFilters, setShowFilters] = useSessionStorageState(
    "teachers-list-show-filters",
    false,
  );
  const [filters, setFilters] = useSessionStorageState(
    "teachers-list-filters",
    DEFAULT_FILTERS,
  );
  const [confirmId, setConfirmId] = useState(null);
  const [deactivationReason, setDeactivationReason] = useState("");
  const [reactivating, setReactivating] = useState(null);
  const importRef = useRef(null);
  const currentPage = useRef(Math.max(1, Number(savedPage) || 1));

  useEffect(() => {
    const params = new URLSearchParams(filterSearch);
    if (
      !params.has("filterSource") &&
      !params.has("gender") &&
      !params.has("employmentStatus")
    ) {
      setSyncedFilterSearch(filterSearch);
      return;
    }
    setFilters({
      ...DEFAULT_FILTERS,
      gender: params.get("gender") || "",
      employmentStatus: params.get("employmentStatus") || "",
    });
    currentPage.current = 1;
    setSavedPage(1);
    setSyncedFilterSearch(filterSearch);
  }, [filterSearch, setFilters, setSavedPage]);

  const load = useCallback(
    async (page = 1) => {
      currentPage.current = page;
      setSavedPage(page);
      persistSessionStorageValue("teachers-list-page", page);
      setLoading(true);
      try {
        const params = { page, limit: 20, ...(debQ ? { search: debQ } : {}) };
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params[key] = value;
        });
        let response = await api.get("/teachers", { params });
        const lastPage = Math.max(1, response.data.pagination?.totalPages || 1);
        if (page > lastPage) {
          page = lastPage;
          currentPage.current = page;
          params.page = page;
          setSavedPage(page);
          persistSessionStorageValue("teachers-list-page", page);
          response = await api.get("/teachers", { params });
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
    if (syncedFilterSearch !== filterSearch) return;
    load(currentPage.current);
  }, [filterSearch, load, syncedFilterSearch]);

  const exportTeachers = async () => {
    try {
      const params = { page: 1, limit: 5000, search: debQ, ...filters };
      Object.keys(params).forEach((key) => !params[key] && delete params[key]);
      const response = await api.get("/teachers", { params });
      await downloadXlsx("teachers.xlsx", [
        {
          name: "Teachers",
          rows: [
            teacherTemplate,
            ...response.data.data.map((teacher) =>
              teacherTemplate.map((header) =>
                getTeacherTemplateValue(teacher, header),
              ),
            ),
          ],
        },
      ]);
    } catch {
      toast.error("تعذر تصدير المعلمين");
    }
  };
  const downloadTeacherTemplate = async () => {
    try {
      await downloadXlsx("teachers-template.xlsx", [
        { name: "Teachers", rows: [teacherTemplate] },
      ]);
    } catch {
      toast.error("تعذر تنزيل قالب المعلمين");
    }
  };
  const importTeachers = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const importFile = await prepareTeacherImportFile(file);
      const response = await uploadCsv(api, "/teachers/import", importFile);
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
    downloadTeacherTemplate,
    importTeachers,
    doDelete,
    doReactivate,
    clearFilters,
    hasActiveFilters: Object.values(filters).some(Boolean),
    load,
  };
}
