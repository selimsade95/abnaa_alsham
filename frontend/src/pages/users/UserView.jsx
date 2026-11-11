import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Pencil, UserRound } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function UserView() {
  const { id } = useParams();
  const { has } = useAuth();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/users/${id}`)
      .then((response) => {
        if (!cancelled) setAccount(response.data);
      })
      .catch((error) => {
        toast.error(error?.response?.data?.detail || "تعذر تحميل المستخدم");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-500">
        <Loader2 className="ms-2 inline h-4 w-4 animate-spin" />
        جاري التحميل...
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-4">
        <p className="text-gray-600">المستخدم غير موجود أو لا تملك صلاحية عرضه.</p>
        <Link to="/users" className="text-sm text-[#036A87] hover:underline">
          العودة إلى المستخدمين
        </Link>
      </div>
    );
  }

  const fields = [
    { label: "اسم المستخدم", value: `@${account.username}` },
    {
      label: "تاريخ الإنشاء",
      value: account.createdAt?.slice(0, 10) || "—",
    },
    {
      label: "حساب المعلم",
      value: account.teacherName || account.teacherId || "—",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/users"
            className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowRight className="h-4 w-4" />
            المستخدمون
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            تفاصيل المستخدم
          </h1>
        </div>
        {has("users.update") && (
          <Link
            to={`/users/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#03A9D1]"
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </Link>
        )}
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-[#036A87]">
            <UserRound className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{account.name}</h2>
            <p className="text-sm text-gray-500">@{account.username}</p>
          </div>
        </div>

        <dl className="grid gap-5 border-t border-gray-100 pt-5 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
              <dd className="mt-1 text-sm text-gray-900">{field.value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-medium text-gray-500">الأدوار</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {(account.roleDetails || []).map((role) => (
                <span
                  key={role.id}
                  className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-xs text-[#036A87]"
                >
                  {role.name}
                </span>
              ))}
              {!account.roleDetails?.length && (
                <span className="text-sm text-gray-400">لا توجد أدوار</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">فروع الوصول</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {(account.branchDetails || []).map((branch) => (
                <span
                  key={branch.id}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                >
                  {branch.name}
                </span>
              ))}
              {!account.branchDetails?.length && (
                <span className="text-sm text-gray-400">لا توجد فروع</span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
