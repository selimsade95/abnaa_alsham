import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export function useSettings() {
  const { has } = useAuth();
  const canEdit = has("settings.codeGeneration.update");
  const [data, setData] = useState(null);
  const [registrationPaths, setRegistrationPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState({});

  const refreshPreview = useCallback(async (settings) => {
    try {
      const response = await api.post(
        "/settings/code-generation/preview",
        settings,
      );
      setPreview(response.data);
    } catch {
      /* preview is optional */
    }
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResponse, pathsResponse] = await Promise.all([
        api.get("/settings/code-generation"),
        api.get("/settings/registration-paths"),
      ]);
      setData(settingsResponse.data);
      setRegistrationPaths(pathsResponse.data.paths || []);
      refreshPreview(settingsResponse.data);
    } catch {
      toast.error("تعذر التحميل");
    } finally {
      setLoading(false);
    }
  }, [refreshPreview]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      const response = await api.put("/settings/code-generation", {
        students: data.students,
        teachers: data.teachers,
        classes: data.classes,
        resetYearly: data.resetYearly,
      });
      await api.put("/settings/registration-paths", {
        paths: registrationPaths,
      });
      setData(response.data);
      refreshPreview(response.data);
      toast.success("تم الحفظ");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل الحفظ");
    }
  };
  const updateEntity = (key, field, value) => {
    const next = { ...data, [key]: { ...data[key], [field]: value } };
    setData(next);
    refreshPreview(next);
  };
  return {
    has,
    canEdit,
    data,
    loading,
    preview,
    setData,
    registrationPaths,
    setRegistrationPaths,
    refreshPreview,
    save,
    updateEntity,
  };
}
