import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { emptyStudent } from "@/lib/studentDefaults";
import { useClasses } from "@/hooks/useClasses";

export function useStudentForm(mode) {
  const nav = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(emptyStudent());
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [hobbiesInput, setHobbiesInput] = useState("");
  const [errors, setErrors] = useState({});
  const [showFullInfo, setShowFullInfo] = useState(false);
  const { classes } = useClasses({ limit: 500 });

  useEffect(() => {
    if (mode !== "edit" || !id) return;
    api
      .get(`/students/${id}`)
      .then((response) => {
        const student = response.data;
        if (student.student?.birthdate)
          student.student.birthdate = student.student.birthdate.slice(0, 10);
        const merged = {
          ...emptyStudent(),
          ...student,
          student: { ...emptyStudent().student, ...student.student },
          fullInfo: { ...emptyStudent().fullInfo, ...(student.fullInfo || {}) },
          currentClassId: student.currentClassId || "",
        };
        merged.fees = {
          academicYear: student.fees?.academicYear || "",
          totalPayable: student.fees?.totalPayable || 0,
        };
        setData(merged);
        setHobbiesInput((student.student?.hobbies || []).join("، "));
      })
      .catch(() => toast.error("تعذر تحميل بيانات الطالب"))
      .finally(() => setLoading(false));
  }, [id, mode]);

  const update = (path, value) => {
    setData((previous) => {
      const next = structuredClone(previous);
      const keys = path.split(".");
      let target = next;
      for (let index = 0; index < keys.length - 1; index += 1)
        target = target[keys[index]];
      target[keys[keys.length - 1]] = value;
      return next;
    });
  };
  const toggleLanguage = (language) => {
    const selected = new Set(data.student.languages);
    if (selected.has(language)) selected.delete(language);
    else selected.add(language);
    update("student.languages", Array.from(selected));
  };
  const addSibling = () =>
    update("siblings", [
      ...data.siblings,
      {
        order: data.siblings.length + 1,
        fullName: "",
        gender: "male",
        class: "",
      },
    ]);
  const removeSibling = (index) =>
    update(
      "siblings",
      data.siblings
        .filter((_, itemIndex) => itemIndex !== index)
        .map((sibling, itemIndex) => ({ ...sibling, order: itemIndex + 1 })),
    );
  const updateSibling = (index, key, value) =>
    update(
      "siblings",
      data.siblings.map((sibling, itemIndex) =>
        itemIndex === index ? { ...sibling, [key]: value } : sibling,
      ),
    );
  const addEdu = () =>
    update("previousEducation", [
      ...data.previousEducation,
      {
        classes: "",
        schoolName: "",
        startingDate: "",
        endingDate: "",
        results: "",
      },
    ]);
  const removeEdu = (index) =>
    update(
      "previousEducation",
      data.previousEducation.filter((_, itemIndex) => itemIndex !== index),
    );
  const updateEdu = (index, key, value) =>
    update(
      "previousEducation",
      data.previousEducation.map((education, itemIndex) =>
        itemIndex === index ? { ...education, [key]: value } : education,
      ),
    );
  const validate = () => {
    const nextErrors = {};
    if (!data.student.fullName?.trim())
      nextErrors.fullName = "الاسم الكامل مطلوب";
    if (!data.student.gender) nextErrors.gender = "الجنس مطلوب";
    if (!data.student.birthdate) nextErrors.birthdate = "تاريخ الميلاد مطلوب";
    if (!data.student.newClass?.trim())
      nextErrors.newClass = "الصف الجديد مطلوب";
    if (!data.student.status) nextErrors.status = "الوضع مطلوب";
    if (!data.student.registrationPath)
      nextErrors.registrationPath = "مسار التسجيل مطلوب";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.error("يرجى تعبئة الحقول المطلوبة");
      return;
    }
    const payload = structuredClone(data);
    payload.student.hobbies = hobbiesInput
      .split(/[,،]/)
      .map((hobby) => hobby.trim())
      .filter(Boolean);
    if (payload.student.birthdate?.length === 10)
      payload.student.birthdate = `${payload.student.birthdate}T00:00:00`;
    if (mode === "edit") delete payload.initialPayment;
    else if (
      !payload.initialPayment?.amount ||
      Number(payload.initialPayment.amount) <= 0
    )
      delete payload.initialPayment;
    setSaving(true);
    try {
      if (mode === "edit") {
        await api.put(`/students/${id}`, payload);
        toast.success("تم التحديث");
        nav(`/students/${id}`);
      } else {
        const response = await api.post("/students", payload);
        toast.success("تم الإنشاء");
        nav(`/students/${response.data.id}`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || "تعذر حفظ البيانات");
    } finally {
      setSaving(false);
    }
  };
  return {
    nav,
    id,
    data,
    loading,
    saving,
    hobbiesInput,
    setHobbiesInput,
    errors,
    classes,
    showFullInfo,
    setShowFullInfo,
    update,
    toggleLanguage,
    addSibling,
    removeSibling,
    updateSibling,
    addEdu,
    removeEdu,
    updateEdu,
    submit,
  };
}
