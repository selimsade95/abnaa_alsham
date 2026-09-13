import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export function useClasses(params = {}, enabled = true) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const query = JSON.stringify(params);

  const load = useCallback(async () => {
    if (!enabled) {
      setClasses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get("/classes", { params: JSON.parse(query) });
      setClasses(response.data.data || []);
    } finally {
      setLoading(false);
    }
  }, [enabled, query]);

  useEffect(() => {
    load().catch(() => setClasses([]));
  }, [load]);

  return { classes, loading, reload: load };
}
