import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { GENDER_LABELS } from "@/lib/studentDefaults";
import { useAuth } from "@/lib/auth";

const fields = [
  ["code", "الكود"],
  ["gender", "الجنس"],
  ["phone", "الهاتف"],
  ["address", "العنوان"],
  ["specialization", "التخصص"],
  ["qualification", "المؤهل"],
  ["employmentStatus", "الحالة"],
  ["notes", "ملاحظات"],
];

export default function TeacherView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { has } = useAuth();
  const [teacher, setTeacher] = useState(null);

  useEffect(() => {
    api
      .get(`/teachers/${id}`)
      .then((response) => setTeacher(response.data))
      .catch((error) => {
        toast.error(error?.response?.data?.detail || "تعذر تحميل بيانات المعلم");
      });
  }, [id]);

  if (!teacher)
    return (
      <div className="py-16 text-center text-gray-500">
        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
        جاري التحميل...
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowRight className="h-4 w-4" /> رجوع
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {teacher.fullName}
          </h1>
        </div>
        {has("teachers.update") && (
          <Link
            to={`/teachers/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" /> تعديل
          </Link>
        )}
      </div>
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(([key, label]) => (
            <div key={key}>
              <dt className="text-sm text-gray-500">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm font-medium text-gray-900">
                {key === "gender"
                  ? GENDER_LABELS[teacher[key]] || "—"
                  : key === "employmentStatus"
                    ? teacher[key] === "active"
                      ? "نشط"
                      : "غير نشط"
                    : teacher[key] || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
