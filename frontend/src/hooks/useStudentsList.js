import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  registrationPath: [],
  classId: [],
  status: [],
  academicYear: "",
  paymentStatus: "",
  finalRegistrationPath: [],
};

const MULTI_VALUE_FILTERS = [
  "registrationPath",
  "finalRegistrationPath",
  "classId",
  "status",
];

const normalizeFilters = (filters) =>
  Object.fromEntries(
    Object.entries({ ...DEFAULT_FILTERS, ...filters }).map(([key, value]) => [
      key,
      MULTI_VALUE_FILTERS.includes(key)
        ? Array.isArray(value)
          ? value
          : value
            ? [value]
            : []
        : value,
    ]),
  );

const getFiltersFromSearchParams = (searchParams) => {
  const keys = [
    "filterSource",
    ...MULTI_VALUE_FILTERS,
    "gender",
    "orphan",
    "academicYear",
    "paymentStatus",
  ];
  if (!keys.some((key) => searchParams.has(key))) return null;
  return normalizeFilters(
    Object.fromEntries(
      keys
        .filter((key) => key !== "filterSource")
        .filter((key) => searchParams.has(key))
        .map((key) => [
          key,
          MULTI_VALUE_FILTERS.includes(key)
            ? searchParams
                .get(key)
                .split(",")
                .filter(Boolean)
            : searchParams.get(key),
        ]),
    ),
  );
};

const serializeFilters = (filters) =>
  Object.fromEntries(
    Object.entries(filters).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length ? [[key, value.join(",")]] : [];
      }
      return value ? [[key, value]] : [];
    }),
  );

const studentColumns = [
  { label: "fullName", value: (s) => s.student?.fullName },
  { label: "gender", value: (s) => s.student?.gender },
  { label: "birthdate", value: (s) => s.student?.birthdate },
  { label: "registrationPath", value: (s) => s.student?.registrationPath },
  {
    label: "finalRegistrationPath",
    value: (s) => s.student?.finalRegistrationPath,
    permission: "students.fullInformation.view",
  },
  {
    label: "newClass",
    value: (s) => s.student?.newClass || s.currentClass?.name,
    permission: "students.fullInformation.view",
  },
  {
    label: "currentAddress",
    value: (s) => s.student?.currentAddress,
    permission: "students.fullInformation.view",
  },
  { label: "orphan", value: (s) => Boolean(s.student?.orphan) },
  {
    label: "orphanOf",
    value: (s) => s.student?.orphanOf,
    permission: "students.fullInformation.view",
  },
  {
    label: "orphanDocType",
    value: (s) => s.student?.orphanDocType,
    permission: "students.fullInformation.view",
  },
  {
    label: "fatherName",
    value: (s) => s.father?.name,
    permission: "students.fullInformation.view",
  },
  {
    label: "fatherDeceased",
    value: (s) => s.father?.alive === false,
    permission: "students.fullInformation.view",
  },
  {
    label: "motherName",
    value: (s) => s.mother?.name,
    permission: "students.fullInformation.view",
  },
  {
    label: "motherPhone",
    value: (s) => s.mother?.phone,
    permission: "students.fullInformation.view",
  },
  {
    label: "academicYear",
    value: (s) => s.fees?.academicYear,
    permission: "payments.view",
  },
  {
    label: "academicFee",
    value: (s) => s.fees?.byType?.academic?.payable,
    permission: "payments.view",
  },
  {
    label: "academicPaid",
    value: (s) => s.fees?.byType?.academic?.paid,
    permission: "payments.view",
  },
  {
    label: "academicRemaining",
    value: (s) => s.fees?.byType?.academic?.remaining,
    permission: "payments.view",
  },
  {
    label: "generalDiscountPercentage",
    value: (s) => s.fees?.generalDiscountPercentage,
    permission: "payments.view",
  },
  {
    label: "siblingsStaffDiscountPercentage",
    value: (s) => s.fees?.siblingsStaffDiscountPercentage,
    permission: "payments.view",
  },
  {
    label: "booksFee",
    value: (s) => s.fees?.byType?.books?.payable,
    permission: "payments.view",
  },
  {
    label: "booksPaid",
    value: (s) => s.fees?.byType?.books?.paid,
    permission: "payments.view",
  },
  {
    label: "booksRemaining",
    value: (s) => s.fees?.byType?.books?.remaining,
    permission: "payments.view",
  },
  {
    label: "busFee",
    value: (s) => s.fees?.byType?.transportation?.payable,
    permission: "payments.view",
  },
  {
    label: "busPaid",
    value: (s) => s.fees?.byType?.transportation?.paid,
    permission: "payments.view",
  },
  {
    label: "busRemaining",
    value: (s) => s.fees?.byType?.transportation?.remaining,
    permission: "payments.view",
  },
  {
    label: "outfitFee",
    value: (s) => s.fees?.byType?.outfit?.payable,
    permission: "payments.view",
  },
  {
    label: "outfitPaid",
    value: (s) => s.fees?.byType?.outfit?.paid,
    permission: "payments.view",
  },
  {
    label: "outfitRemaining",
    value: (s) => s.fees?.byType?.outfit?.remaining,
    permission: "payments.view",
  },
  {
    label: "totalPayable",
    value: (s) => s.fees?.overallPayable,
    permission: "payments.view",
  },
  {
    label: "totalPaid",
    value: (s) => s.fees?.totalPaid,
    permission: "payments.view",
  },
  {
    label: "totalRemaining",
    value: (s) => s.fees?.remaining,
    permission: "payments.view",
  },
  {
    label: "busNo",
    value: (s) => s.student?.busNumber,
    permission: "students.fullInformation.view",
  },
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
  "generalDiscountPercentage",
  "siblingsStaffDiscountPercentage",
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
  const [searchParams] = useSearchParams();
  const filterSearch = searchParams.toString();
  const initialUrlFilters = getFiltersFromSearchParams(
    new URLSearchParams(filterSearch),
  );
  const [syncedFilterSearch, setSyncedFilterSearch] = useState(() =>
    initialUrlFilters ? null : filterSearch,
  );
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
  const [pageSize, setPageSize] = useSessionStorageState(
    "students-list-page-size",
    10,
  );
  const [sortBy, setSortBy] = useSessionStorageState(
    "students-list-sort-by",
    "",
  );
  const [sortOrder, setSortOrder] = useSessionStorageState(
    "students-list-sort-order",
    "asc",
  );
  const [pagination, setPagination] = useState({
    page: savedPage,
    limit: pageSize,
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
  const [importProgress, setImportProgress] = useState(null);
  const importRef = useRef(null);
  const currentPage = useRef(
    initialUrlFilters ? 1 : Math.max(1, Number(savedPage) || 1),
  );

  useEffect(() => {
    const urlFilters = getFiltersFromSearchParams(new URLSearchParams(filterSearch));
    if (!urlFilters) {
      setSyncedFilterSearch(filterSearch);
      return;
    }
    setFilters(urlFilters);
    currentPage.current = 1;
    setSavedPage(1);
    setSyncedFilterSearch(filterSearch);
  }, [filterSearch, setFilters, setSavedPage]);

  useEffect(() => {
    const normalized = normalizeFilters(filters);
    if (JSON.stringify(filters) !== JSON.stringify(normalized))
      setFilters(normalized);
  }, [filters, setFilters]);

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
        const params = { page, limit: pageSize };
        if (debQ) params.search = debQ;
        if (sortBy) {
          params.sortBy = sortBy;
          params.sortOrder = sortOrder;
        }
        Object.assign(params, serializeFilters(normalizeFilters(filters)));
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
    [debQ, filters, pageSize, setSavedPage, sortBy, sortOrder],
  );

  const sortStudents = useCallback(
    (field) => {
      currentPage.current = 1;
      setSavedPage(1);
      if (sortBy === field) {
        setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortOrder("asc");
      }
    },
    [setSavedPage, setSortBy, setSortOrder, sortBy],
  );

  const changePageSize = useCallback(
    (size) => {
      currentPage.current = 1;
      setSavedPage(1);
      setPageSize(size);
    },
    [setPageSize, setSavedPage],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (syncedFilterSearch !== filterSearch) return;
    load(currentPage.current);
  }, [filterSearch, load, syncedFilterSearch]);

  const exportStudents = async () => {
    try {
      const params = {
        page: 1,
        limit: 5000,
        ...(debQ ? { search: debQ } : {}),
        ...serializeFilters(normalizeFilters(filters)),
      };
      const response = await api.get("/students", { params });
      downloadCsv(
        "students.csv",
        studentColumns.filter(
          ({ permission }) => !permission || has(permission),
        ),
        response.data.data,
      );
    } catch {
      toast.error("تعذر تصدير الطلاب");
    }
  };

  const importStudents = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importProgress) return;
    setImportProgress({ stage: "uploading", percent: 0 });
    try {
      const response = await uploadCsv(
        api,
        "/students/import",
        file,
        ({ loaded, total }) => {
          if (!total) {
            setImportProgress({ stage: "uploading", percent: null });
            return;
          }
          const percent = Math.min(100, Math.round((loaded / total) * 100));
          setImportProgress(
            percent >= 100
              ? { stage: "processing", percent: null }
              : { stage: "uploading", percent },
          );
        },
      );
      toast.success(`تم استيراد ${response.data.created} طالب`);
      load(1);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر استيراد الطلاب");
    } finally {
      setImportProgress(null);
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
  const normalizedFilters = normalizeFilters(filters);

  return {
    has,
    nav,
    items,
    registrationPaths,
    summary,
    pagination,
    changePageSize,
    sortBy,
    sortOrder,
    sortStudents,
    loading,
    q,
    setQ,
    showFilters,
    setShowFilters,
    filters: normalizedFilters,
    setFilters,
    classes,
    confirmId,
    setConfirmId,
    deactivationReason,
    setDeactivationReason,
    deleting,
    reactivating,
    importProgress,
    importRef,
    load,
    doDelete,
    doReactivate,
    clearFilters,
    exportStudents,
    importStudents,
    studentTemplate,
    activeCount: Object.values(normalizedFilters).filter((value) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value),
    ).length,
  };
}
