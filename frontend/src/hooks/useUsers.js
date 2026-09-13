import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export function useUsers() {
  const { user, has } = useAuth();
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [usersResponse, rolesResponse, teachersResponse] =
        await Promise.all([
          api.get("/users"),
          api.get("/roles").catch(() => ({ data: [] })),
          api
            .get("/teachers", { params: { limit: 500 } })
            .catch(() => ({ data: { data: [] } })),
        ]);
      setItems(usersResponse.data);
      setRoles(rolesResponse.data);
      setTeachers(teachersResponse.data.data || []);
    } catch {
      toast.error("تعذر تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openNew = () =>
    setEditing({
      id: null,
      name: "",
      username: "",
      password: "",
      roles: [],
      teacherId: "",
    });
  const openEdit = (account) =>
    setEditing({
      id: account.id,
      name: account.name,
      username: account.username,
      password: "",
      roles: account.roles || [],
      teacherId: account.teacherId || "",
    });
  const toggleRole = (roleId) => {
    const selected = new Set(editing.roles);
    if (selected.has(roleId)) selected.delete(roleId);
    else selected.add(roleId);
    setEditing({ ...editing, roles: Array.from(selected) });
  };
  const save = async (event) => {
    event.preventDefault();
    try {
      if (editing.id) {
        const body = {
          name: editing.name,
          roles: editing.roles,
          teacherId: editing.teacherId || null,
        };
        if (editing.password) body.password = editing.password;
        await api.put(`/users/${editing.id}`, body);
      } else {
        if (!editing.password || editing.password.length < 4) {
          toast.error("كلمة المرور 4 أحرف على الأقل");
          return;
        }
        await api.post("/users", {
          name: editing.name,
          username: editing.username,
          password: editing.password,
          roles: editing.roles,
          teacherId: editing.teacherId || null,
        });
      }
      toast.success("تم الحفظ");
      setEditing(null);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل الحفظ");
    }
  };
  const doDelete = async () => {
    try {
      await api.delete(`/users/${confirmId}`);
      toast.success("تم الحذف");
      setConfirmId(null);
      load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "فشل الحذف");
    }
  };
  const roleName = (roleId) =>
    roles.find((role) => role.id === roleId)?.name || "—";
  return {
    user,
    has,
    items,
    roles,
    teachers,
    loading,
    editing,
    setEditing,
    confirmId,
    setConfirmId,
    openNew,
    openEdit,
    toggleRole,
    save,
    doDelete,
    roleName,
  };
}
