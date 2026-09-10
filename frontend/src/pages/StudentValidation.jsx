import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

export default function StudentValidation() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get(`/public/students/${id}/validation`)
      .then((response) => setData(response.data))
      .catch(() => setError(true));
  }, [id]);

  if (!data && !error)
    return (
      <div
        className="min-h-screen flex items-center justify-center text-gray-500"
        dir="rtl"
      >
        <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري التحقق...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8" dir="rtl">
      <main className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-[#BDEFFA] bg-white shadow-lg">
        <header className="bg-[#E0F9FF] px-6 py-5 flex items-center gap-3 border-b-2 border-[#04CDF9]">
          <img
            src="/assets/logo.png"
            alt="مدرسة أبناء الشام"
            className="h-14 w-14 object-contain"
          />
          <div>
            <div className="text-xl font-extrabold text-gray-900">
              مدرسة أبناء الشام
            </div>
            <div className="text-xs text-[#036A87]">
              التحقق من بيانات الطالب
            </div>
          </div>
        </header>
        {error ? (
          <div className="p-10 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-bold text-gray-900">
              تعذر التحقق
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              بيانات الطالب غير موجودة أو لم تعد متاحة.
            </p>
          </div>
        ) : (
          <div className="p-6 text-center">
            {!data.isActive && data.deactivationReason && (
              <div
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 text-right"
                role="alert"
              >
                <span className="font-bold">سبب التعطيل:</span>{" "}
                {data.deactivationReason}
              </div>
            )}
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${data.isActive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}
            >
              {data.isActive ? (
                <ShieldCheck className="h-8 w-8" />
              ) : (
                <ShieldAlert className="h-8 w-8" />
              )}
            </div>
            <div
              className={`mt-4 text-sm font-bold ${data.isActive ? "text-emerald-700" : "text-red-700"}`}
            >
              {data.isActive
                ? "بيانات الطالب صالحة والطالب نشط"
                : "الطالب غير نشط"}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-gray-900">
              {data.fullName}
            </h1>
            <div className="mt-1 font-mono text-sm text-[#036A87]">
              {data.code}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-right">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">الصف</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.className || "—"}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">الشعبة</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.section || "—"}
                </div>
              </div>
              <div className="col-span-2 rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">السنة الدراسية</div>
                <div className="mt-1 text-sm font-semibold">
                  {data.academicYear || "—"}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
