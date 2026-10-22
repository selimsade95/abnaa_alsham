import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Login() {
  const { login, selectBranch, pendingBranches, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (user) nav("/dashboard", { replace: true });
  }, [user, nav]);

  useEffect(() => {
    if (pendingBranches.length > 0 && !branchId) {
      setBranchId(pendingBranches[0].id);
    }
  }, [pendingBranches, branchId]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (pendingBranches.length > 0) {
        await selectBranch(branchId);
      } else {
        const result = await login(username.trim(), password);
        if (result.requiresBranchSelection) {
          setBranchId(result.branches[0]?.id || "");
          return;
        }
      }
      toast.success("تم تسجيل الدخول");
      nav(loc.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (e) {
      const msg = e?.response?.data?.detail || "فشل تسجيل الدخول";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Cover side */}
      <div className="hidden lg:block relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/assets/school.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 mix-blend-multiply" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <img
            src="/assets/logo.png"
            alt="IQRA"
            className="h-16 w-16 object-contain bg-white/95 rounded-2xl p-2"
          />
          <div>
            <h1 className="text-4xl font-extrabold mb-3 leading-tight">
              مرحباً بك في نظام إدارة المدرسة
            </h1>
            <p className="text-white/90 text-lg max-w-md leading-relaxed">
              منصة سريعة, آمنة, موثوقة, وأنيقة لإدارة مدرسة أبناء الشام.
            </p>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="relative flex items-center justify-center p-6 sm:p-12 bg-[#F8FAFC]">
        <div className="absolute end-4 top-4">
          <LanguageSwitcher />
        </div>
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <img
              src="/assets/logo.png"
              alt="IQRA"
              className="h-12 w-12 object-contain"
            />
            <div>
              <div className="text-lg font-bold text-gray-900">
                مدرسة أبناء الشام
              </div>
              <div className="text-xs text-gray-500">نظام إدارة المدرسة</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            تسجيل الدخول
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            أدخل بيانات الاعتماد للوصول إلى لوحة التحكم
          </p>

          <form onSubmit={submit} className="space-y-4">
            {pendingBranches.length > 0 ? (
              <div>
                <p className="mb-3 text-sm text-gray-600">
                  تم التحقق من بيانات الدخول. اختر الفرع الذي تريد فتحه.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  الفرع
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  data-testid="login-branch-select"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9]"
                >
                  {pendingBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    اسم المستخدم
                  </label>
                  <input
                    data-testid="login-username-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9] focus:border-transparent"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    كلمة المرور
                  </label>
                  <input
                    data-testid="login-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#04CDF9] focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              </>
            )}

            {err && (
              <div
                data-testid="login-error"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                (pendingBranches.length > 0
                  ? !branchId
                  : !username || !password)
              }
              data-testid="login-submit-btn"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#04CDF9] px-4 py-2.5 font-semibold text-white hover:bg-[#03A9D1] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              دخول
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
