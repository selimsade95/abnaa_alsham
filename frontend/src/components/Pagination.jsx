const Pagination = ({ pagination, onPageChange, testId = "pagination" }) => {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;

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
      className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4"
    >
      <div className="text-xs text-gray-500">
        صفحة {page} من {totalPages}
        {total !== undefined && <> • الإجمالي {total}</>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="الصفحة السابقة"
          className={`${buttonClass} border-gray-300 bg-white text-gray-700`}
        >
          السابق
        </button>
        {firstVisible > 1 && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              aria-label="الصفحة 1"
              className={`${buttonClass} border-gray-300 bg-white text-gray-700`}
            >
              1
            </button>
            {firstVisible > 2 && (
              <span className="px-1 text-gray-400" aria-hidden="true">
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
                ? "border-[#036A87] bg-[#036A87] text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {number}
          </button>
        ))}
        {lastVisible < totalPages && (
          <>
            {lastVisible < totalPages - 1 && (
              <span className="px-1 text-gray-400" aria-hidden="true">
                …
              </span>
            )}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              aria-label={`الصفحة ${totalPages}`}
              className={`${buttonClass} border-gray-300 bg-white text-gray-700`}
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
          className={`${buttonClass} border-gray-300 bg-white text-gray-700`}
        >
          التالي
        </button>
      </div>
    </nav>
  );
};

export default Pagination;
