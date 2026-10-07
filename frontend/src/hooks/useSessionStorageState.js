import { useEffect, useState } from "react";

export function persistSessionStorageValue(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the current session usable if storage is unavailable.
  }
}

export function useSessionStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const stored = window.sessionStorage.getItem(key);
      return stored === null ? initialValue : JSON.parse(stored);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    persistSessionStorageValue(key, value);
  }, [key, value]);

  return [value, setValue];
}
