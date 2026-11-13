const Pagination = ({
  pagination,
  onPageChange,
  onPageSizeChange,
  testId = "pagination",
}) => {
  const { page, totalPages, total } = pagination;
  const canChangePageSize = typeof onPageSizeChange === "function";
  if (totalPages <= 1 && !canChangePageSize) return null;

  const firstVisible = Math.max(1, Math.min(page - 2, totalPages - 4));
  const lastVisible = Math.min(totalPages, firstVisible + 4);
  const visiblePages = Array.from(
    { length: lastVisible - firstVisible + 1 },
    (_, index) => firstVisible + index,
  );

  const buttonClass =
    "min-w-9 rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav
      aria-label="التنقل بين الصفحات"
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"
    >
      <div className="text-xs text-muted-foreground">
        صفحة {page} من {totalPages}
        {total !== undefined && <> • الإجمالي {total}</>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {canChangePageSize && (
          <label className="me-2 flex items-center gap-2 text-xs text-muted-foreground">
            عدد العناصر
            <select
              value={pagination.limit}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              aria-label="عدد العناصر في الصفحة"
              className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        {totalPages > 1 && (
          <>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="الصفحة السابقة"
              className={`${buttonClass} border-input bg-card text-foreground`}
            >
              السابق
            </button>
            {firstVisible > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => onPageChange(1)}
                  aria-label="الصفحة 1"
                  className={`${buttonClass} border-input bg-card text-foreground`}
                >
                  1
                </button>
                {firstVisible > 2 && (
                  <span className="px-1 text-muted-foreground" aria-hidden="true">
                    …
                  </span>
                )}
              </>
            )}
            {visiblePages.map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => onPageChange(number)}
                aria-label={`الصفحة ${number}`}
                aria-current={number === page ? "page" : undefined}
                disabled={number === page}
                className={`${buttonClass} ${
                  number === page
                    ? "border-ring bg-primary text-white"
                    : "border-input bg-card text-foreground hover:bg-muted"
                }`}
              >
                {number}
              </button>
            ))}
            {lastVisible < totalPages && (
              <>
                {lastVisible < totalPages - 1 && (
                  <span className="px-1 text-muted-foreground" aria-hidden="true">
                    …
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onPageChange(totalPages)}
                  aria-label={`الصفحة ${totalPages}`}
                  className={`${buttonClass} border-input bg-card text-foreground`}
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="الصفحة التالية"
              className={`${buttonClass} border-input bg-card text-foreground`}
            >
              التالي
            </button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Pagination;
