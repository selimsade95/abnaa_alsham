import WhatsAppPhone from "@/components/WhatsAppPhone";
import { t } from "@/i18n";
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
  <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
    <h2 className="mb-4 flex items-center gap-2 border-b border-border pb-3 text-base font-semibold text-foreground">
      <Icon className="h-4 w-4 text-accent-foreground" />
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
            <dt className="text-xs font-medium text-muted-foreground">{t(label)}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-foreground">
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
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
        جاري التحميل...
      </div>
    );

  if (loadError || !teacher)
    return (
      <div className="space-y-4 py-16 text-center text-muted-foreground">
        <p>تعذر عرض بيانات المعلم.</p>
        <button
          type="button"
          onClick={() => navigate("/teachers")}
          className="text-sm font-medium text-accent-foreground hover:underline"
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
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <UserRound className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {teacher.fullName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
                ? "border-border bg-muted text-muted-foreground"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {teacher.employmentStatus === "inactive" ? "غير نشط" : "نشط"}
          </span>
          {has("teachers.update") && (
            <Link
              to={`/teachers/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Pencil className="h-4 w-4" /> تعديل
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <Phone className="h-5 w-5 text-accent-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">الهاتف</p>
            <p className="truncate text-sm font-semibold text-foreground">
              <WhatsAppPhone phone={phone} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <MapPin className="h-5 w-5 text-accent-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">العنوان</p>
            <p className="truncate text-sm font-semibold text-foreground">
              {teacher.address || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <BriefcaseBusiness className="h-5 w-5 text-accent-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">القسم / الوصف الوظيفي</p>
            <p className="truncate text-sm font-semibold text-foreground">
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-foreground">
              الشهادة المرفقة
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {teacher.certificateFile.originalName}
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCertificate}
            className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            <Download className="h-4 w-4" /> تنزيل الشهادة
          </button>
        </div>
      )}

      {teacher.notes && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-2 text-base font-semibold text-foreground">ملاحظات</h2>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {teacher.notes}
          </p>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <GraduationCap className="h-5 w-5 text-accent-foreground" />
            الصفوف المسندة
          </h2>
          {canViewClasses && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
              {classes.length}
            </span>
          )}
        </div>
        {!canViewClasses ? (
          <p className="text-sm text-muted-foreground">
            لا تتوفر صلاحية عرض الصفوف.
          </p>
        ) : classes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            لا توجد صفوف مسندة لهذا المعلم.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((classItem) => (
              <Link
                key={classItem.id}
                to={`/classes/${classItem.id}`}
                className="rounded-lg border border-border p-4 transition-colors hover:border-ring hover:bg-cyan-50/40"
              >
                <p className="font-semibold text-foreground">{classItem.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
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
