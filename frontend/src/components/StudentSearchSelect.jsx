import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Search } from "lucide-react";

export default function StudentSearchSelect({
  excludeIds = [],
  onSelect,
  placeholder = "ابحث عن طالب",
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const excludeKey = excludeIds.join(",");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const excluded = new Set(excludeIds);
  const options = (students || [])
    .filter((student) => !excluded.has(student.id))
    .filter((student) => {
      const name = student.student?.fullName || student.fullName || "";
      const code = student.code || "";
      return (
        !normalizedQuery ||
        name.toLocaleLowerCase().includes(normalizedQuery) ||
        code.toLocaleLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, 10);

  useEffect(() => {
    if (!open) return undefined;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setStudents([]);
    const timer = setTimeout(async () => {
      setError("");
      try {
        const response = await api.get("/students/options", {
          params: {
            ...(query.trim() ? { search: query.trim() } : {}),
            ...(excludeKey ? { excludeIds: excludeKey } : {}),
          },
        });
        if (currentRequest === requestId.current)
          setStudents(response.data.data || []);
      } catch {
        if (currentRequest === requestId.current) {
          setStudents([]);
          setError("تعذر تحميل الطلاب");
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, query.trim() ? 250 : 0);

    return () => {
      clearTimeout(timer);
      requestId.current += 1;
    };
  }, [excludeKey, open, query]);

  return (
    <div className="relative">
      <div className="flex items-center rounded-lg border border-gray-300 bg-white px-3 focus-within:ring-2 focus-within:ring-[#04CDF9]">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="w-full border-0 px-2 py-2 text-sm outline-none focus:ring-0"
        />
      </div>
      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {loading ? (
            <p className="px-3 py-2 text-sm text-gray-500">جاري البحث...</p>
          ) : error ? (
            <p className="px-3 py-2 text-sm text-red-600">{error}</p>
          ) : options.length ? (
            options.map((student) => (
              <button
                key={student.id}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onSelect(student);
                  setQuery("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-right text-sm text-gray-800 hover:bg-gray-50"
              >
                {student.student?.fullName || student.fullName || "—"}
                {student.code && (
                  <span className="ms-2 text-xs text-gray-500">
                    {student.code}
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">
              لا توجد نتائج مطابقة.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
