import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user) nav("/dashboard", { replace: true });
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      toast.success("تم تسجيل الدخول");
      const to = loc.state?.from?.pathname || "/dashboard";
      nav(to, { replace: true });
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
            backgroundImage:
              "url(https://images.unsplash.com/photo-1573765727997-e02883182ba7?crop=entropy&cs=srgb&fm=jpg&w=1400&q=80)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-[#04CDF9]/60 mix-blend-multiply" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <img
            src="/assets/logo.png"
            alt="IQRA"
            className="h-16 w-16 object-contain bg-white/95 rounded-2xl p-2"
          />
          <div>
            <h1 className="text-4xl font-extrabold mb-3 leading-tight">
              مرحباً بك في نظام تسجيل الطلاب
            </h1>
            <p className="text-white/90 text-lg max-w-md leading-relaxed">
              منصة بسيطة وأنيقة لإدارة تسجيلات طلاب مدرسة أبناء الشام.
            </p>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-[#F8FAFC]">
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
              <div className="text-xs text-gray-500">نظام تسجيل الطلاب</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            تسجيل الدخول
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            أدخل بيانات الاعتماد للوصول إلى لوحة التحكم
          </p>

          <form onSubmit={submit} className="space-y-4">
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
              disabled={loading || !username || !password}
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
