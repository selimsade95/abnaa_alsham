import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Download,
  GraduationCap,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { GENDER_LABELS } from "@/lib/studentDefaults";
import { useAuth } from "@/lib/auth";

const personalFields = [
  ["fatherName", "اسم الأب"],
  ["motherName", "اسم الأم"],
  ["registrationDate", "تاريخ التسجيل"],
  ["birthPlace", "مكان الولادة"],
  ["birthDate", "تاريخ الولادة"],
  ["idNumber", "رقم الهوية"],
  ["address", "العنوان"],
  ["martialStatus", "الحالة الاجتماعية"],
  ["maleChildrenCount", "عدد الأبناء الذكور"],
  ["femaleChildrenCount", "عدد الأبناء الإناث"],
];

const workFields = [
  ["workStartDate", "تاريخ بدء العمل"],
  ["department", "القسم"],
  ["office", "المكتب"],
  ["education", "المؤهل العلمي"],
  ["volunteer", "متطوع"],
  ["jobDescription", "الوصف الوظيفي"],
  ["skills", "المهارات"],
  ["certificate", "الشهادة"],
];

const InfoSection = ({ title, icon: Icon, fields, teacher }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3 text-base font-semibold text-gray-900">
      <Icon className="h-4 w-4 text-[#036A87]" />
      {title}
    </h2>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map(([key, label]) => {
        const value =
          key === "registrationDate"
            ? (teacher.reactivatedAt || teacher.createdAt)?.slice(0, 10)
            : key === "education"
            ? teacher.education || teacher.qualification
            : key === "jobDescription"
              ? teacher.jobDescription || teacher.specialization
              : key === "martialStatus"
                ? teacher.martialStatus || teacher.maritalStatus
                : key === "volunteer"
                  ? teacher.volunteer === true || teacher.volunteer === "true"
                    ? "نعم"
                    : teacher.volunteer === false ||
                        teacher.volunteer === "false"
                      ? "لا"
                      : ""
                  : key === "certificate"
                    ? teacher.certificateFile?.originalName || teacher.certificate
                  : teacher[key];
        return (
          <div key={key}>
            <dt className="text-xs font-medium text-gray-500">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-gray-900">
              {value || "—"}
            </dd>
          </div>
        );
      })}
    </dl>
  </section>
);

export default function TeacherView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { has } = useAuth();
  const canViewClasses = has("classes.view");
  const [teacher, setTeacher] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const requests = [
      api.get(`/teachers/${id}`),
      canViewClasses
        ? api.get("/classes", {
            params: { teacherId: id, status: "all", limit: 500 },
          })
        : Promise.resolve({ data: { data: [] } }),
    ];
    Promise.allSettled(requests)
      .then(([teacherResult, classesResult]) => {
        if (cancelled) return;
        if (teacherResult.status === "fulfilled") {
          setTeacher(teacherResult.value.data);
        } else {
          setLoadError(true);
          toast.error(
            teacherResult.reason?.response?.data?.detail ||
              "تعذر تحميل بيانات المعلم",
          );
        }
        if (classesResult.status === "fulfilled") {
          setClasses(classesResult.value.data.data || []);
        } else {
          toast.error(
            classesResult.reason?.response?.data?.detail ||
              "تعذر تحميل الصفوف المسندة للمعلم",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewClasses, id]);

  if (loading)
    return (
      <div className="py-16 text-center text-gray-500">
        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
        جاري التحميل...
      </div>
    );

  if (loadError || !teacher)
    return (
      <div className="space-y-4 py-16 text-center text-gray-500">
        <p>تعذر عرض بيانات المعلم.</p>
        <button
          type="button"
          onClick={() => navigate("/teachers")}
          className="text-sm font-medium text-[#036A87] hover:underline"
        >
          العودة إلى قائمة المعلمين
        </button>
      </div>
    );

  const phone = teacher.contactPhone || teacher.phone;
  const downloadCertificate = async () => {
    try {
      const response = await api.get(`/teachers/${id}/certificate`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        teacher.certificateFile?.originalName || "teacher-certificate";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "تعذر تنزيل شهادة المعلم",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-[#036A87]">
              <UserRound className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {teacher.fullName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span className="font-mono">{teacher.code || "—"}</span>
                <span aria-hidden="true">·</span>
                <span>{GENDER_LABELS[teacher.gender] || "—"}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              teacher.employmentStatus === "inactive"
                ? "border-gray-200 bg-gray-50 text-gray-600"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {teacher.employmentStatus === "inactive" ? "غير نشط" : "نشط"}
          </span>
          {has("teachers.update") && (
            <Link
              to={`/teachers/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-4 w-4" /> تعديل
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Phone className="h-5 w-5 text-[#036A87]" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500">الهاتف</p>
            <p className="truncate text-sm font-semibold text-gray-900">
              {phone || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <MapPin className="h-5 w-5 text-[#036A87]" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500">العنوان</p>
            <p className="truncate text-sm font-semibold text-gray-900">
              {teacher.address || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <BriefcaseBusiness className="h-5 w-5 text-[#036A87]" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500">القسم / الوصف الوظيفي</p>
            <p className="truncate text-sm font-semibold text-gray-900">
              {teacher.department ||
                teacher.jobDescription ||
                teacher.specialization ||
                "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <InfoSection
          title="المعلومات الشخصية"
          icon={UserRound}
          fields={personalFields}
          teacher={teacher}
        />
        <InfoSection
          title="المعلومات الوظيفية"
          icon={CalendarDays}
          fields={workFields}
          teacher={teacher}
        />
      </div>

      {teacher.certificateFile && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              الشهادة المرفقة
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {teacher.certificateFile.originalName}
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCertificate}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> تنزيل الشهادة
          </button>
        </div>
      )}

      {teacher.notes && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-gray-900">ملاحظات</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {teacher.notes}
          </p>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <GraduationCap className="h-5 w-5 text-[#036A87]" />
            الصفوف المسندة
          </h2>
          {canViewClasses && (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              {classes.length}
            </span>
          )}
        </div>
        {!canViewClasses ? (
          <p className="text-sm text-gray-500">
            لا تتوفر صلاحية عرض الصفوف.
          </p>
        ) : classes.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            لا توجد صفوف مسندة لهذا المعلم.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((classItem) => (
              <Link
                key={classItem.id}
                to={`/classes/${classItem.id}`}
                className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-[#04CDF9] hover:bg-cyan-50/40"
              >
                <p className="font-semibold text-gray-900">{classItem.name}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {[classItem.grade, classItem.section, classItem.academicYear]
                    .filter(Boolean)
                    .join(" · ") || "لا توجد تفاصيل إضافية"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
