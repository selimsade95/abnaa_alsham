import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("iqra_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [pendingBranches, setPendingBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("iqra_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => {
        if (res.data.activeBranch) {
          setUser(res.data);
          setPendingBranches([]);
          localStorage.setItem("iqra_user", JSON.stringify(res.data));
        } else {
          setUser(null);
          setPendingBranches(res.data.branches || []);
          localStorage.removeItem("iqra_user");
        }
      })
      .catch(() => {
        localStorage.removeItem("iqra_token");
        localStorage.removeItem("iqra_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const res = await api.post("/auth/login", { username, password });
    localStorage.setItem("iqra_token", res.data.token);
    if (res.data.requiresBranchSelection) {
      setUser(null);
      setPendingBranches(res.data.branches || []);
      localStorage.removeItem("iqra_user");
    } else {
      setUser(res.data.user);
      setPendingBranches([]);
      localStorage.setItem("iqra_user", JSON.stringify(res.data.user));
    }
    return res.data;
  };
  const selectBranch = async (branchId) => {
    const res = await api.post("/auth/select-branch", { branchId });
    localStorage.setItem("iqra_token", res.data.token);
    localStorage.setItem("iqra_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
    setPendingBranches([]);
    return res.data.user;
  };
  const logout = () => {
    localStorage.removeItem("iqra_token");
    localStorage.removeItem("iqra_user");
    setUser(null);
    setPendingBranches([]);
  };
  const has = (perm) => (user?.permissions || []).includes(perm);
  const hasAny = (list) => (list || []).some((p) => has(p));

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        selectBranch,
        pendingBranches,
        logout,
        loading,
        has,
        hasAny,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
export function usePermission(perm) {
  const { has } = useAuth();
  return has(perm);
}
