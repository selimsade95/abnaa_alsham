import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { emptyStudent, REGISTRATION_PATHS } from "@/lib/studentDefaults";
import { useClasses } from "@/hooks/useClasses";

function syncParentOrphanData(next) {
  const student = next.student;
  const fatherAlive = next.father.alive !== false;
  const motherAlive = next.mother.alive !== false;

  if (student.orphan && student.orphanOf) {
    next.father.alive = !["father", "both"].includes(student.orphanOf);
    next.mother.alive = !["mother", "both"].includes(student.orphanOf);
    return next;
  }

  const deceased = [
    ...(!fatherAlive ? ["father"] : []),
    ...(!motherAlive ? ["mother"] : []),
  ];
  if (deceased.length) {
    student.orphan = true;
    student.orphanOf =
      deceased.length === 2
        ? "both"
        : deceased[0] === "father"
          ? "father"
          : "mother";
  } else if (!student.orphan) {
    student.orphanOf = "";
  }

  return next;
}

export function useStudentForm(mode) {
  const nav = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(emptyStudent());
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [hobbiesInput, setHobbiesInput] = useState("");
  const [errors, setErrors] = useState({});
  const [showFullInfo, setShowFullInfo] = useState(false);
  const [registrationPaths, setRegistrationPaths] =
    useState(REGISTRATION_PATHS);
  const { classes } = useClasses({ limit: 500 });

  useEffect(() => {
    api
      .get("/registration-paths")
      .then((response) => {
        const paths = response.data.paths || [];
        setRegistrationPaths(paths);
        if (mode === "create" && paths.length) {
          setData((previous) => {
            if (paths.includes(previous.student.registrationPath))
              return previous;
            return {
              ...previous,
              student: {
                ...previous.student,
                registrationPath: paths[0],
                finalRegistrationPath: paths[0],
              },
            };
          });
        }
      })
      .catch(() => setRegistrationPaths(REGISTRATION_PATHS));
  }, [mode]);

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
          student: {
            ...emptyStudent().student,
            ...student.student,
            finalRegistrationPath:
              student.student?.finalRegistrationPath ||
              student.student?.registrationPath ||
              "",
          },
          fullInfo: { ...emptyStudent().fullInfo, ...(student.fullInfo || {}) },
          father: { ...emptyStudent().father, ...(student.father || {}) },
          mother: { ...emptyStudent().mother, ...(student.mother || {}) },
          general: { ...emptyStudent().general, ...(student.general || {}) },
          otherInfo: {
            ...emptyStudent().otherInfo,
            ...(student.otherInfo || {}),
          },
          signing: { ...emptyStudent().signing, ...(student.signing || {}) },
          currentClassId: student.currentClassId || "",
        };
        syncParentOrphanData(merged);
        merged.fees = {
          academicYear: student.fees?.academicYear || "",
          totalPayable: student.fees?.totalPayable || 0,
          discountEnabled: student.fees?.discountEnabled || false,
          discountPercentage: student.fees?.discountPercentage || 0,
          booksFee: student.fees?.booksFee || 0,
          busFee: student.fees?.busFee || 0,
          busRegistered:
            student.fees?.busRegistered ??
            Number(student.fees?.busFee || 0) > 0,
          outfitFee: student.fees?.outfitFee || 0,
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
      if (path === "student.orphan" && value === false) {
        next.student.orphanOf = "";
        next.father.alive = true;
        next.mother.alive = true;
      } else if (path === "student.orphanOf" && value) {
        next.student.orphan = true;
        next.father.alive = !["father", "both"].includes(value);
        next.mother.alive = !["mother", "both"].includes(value);
      } else if (path === "father.alive" || path === "mother.alive") {
        const fatherAlive = next.father.alive !== false;
        const motherAlive = next.mother.alive !== false;
        const deceased = [
          ...(!fatherAlive ? ["father"] : []),
          ...(!motherAlive ? ["mother"] : []),
        ];
        next.student.orphan = deceased.length > 0;
        next.student.orphanOf =
          deceased.length === 2
            ? "both"
            : deceased[0] === "father"
              ? "father"
              : deceased[0] === "mother"
                ? "mother"
                : "";
      } else if (path === "student.orphan" && value) {
        syncParentOrphanData(next);
      }
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
    if (data.student.orphan && !data.student.orphanOf)
      nextErrors.orphanOf = "يرجى تحديد الوالد المتوفى";
    if (!data.student.registrationPath)
      nextErrors.registrationPath = "مسار التسجيل الأولي مطلوب";
    if (!data.student.finalRegistrationPath)
      nextErrors.finalRegistrationPath = "مسار التسجيل النهائي مطلوب";
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
    registrationPaths,
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
