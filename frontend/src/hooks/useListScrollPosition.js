import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { persistSessionStorageValue } from "@/hooks/useSessionStorageState";

export function useListScrollPosition(loading) {
  const { pathname, search } = useLocation();
  const { user } = useAuth();
  const key = `list-scroll:${user?.id || ""}:${user?.activeBranch?.id || ""}:${pathname}${search}`;

  useLayoutEffect(() => {
    if (loading) return;
    let position = 0;
    try {
      position = Number(window.sessionStorage.getItem(key)) || 0;
    } catch {
      // The list is still usable when storage is unavailable.
    }
    window.scrollTo({ top: position, behavior: "instant" });
    const save = () => persistSessionStorageValue(key, window.scrollY);
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [key, loading]);
}
