const CSV_DELIMITER = ";";

const escapeCell = (value) => {
  const text = value == null ? "" : String(value);
  return new RegExp(`["${CSV_DELIMITER}\\n]`).test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

export const downloadCsv = (filename, columns, rows) => {
  const csv = [
    columns.map((column) => escapeCell(column.label)).join(CSV_DELIMITER),
    ...rows.map((row) =>
      columns
        .map((column) => escapeCell(column.value(row)))
        .join(CSV_DELIMITER),
    ),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const downloadTemplate = (filename, headers) => {
  downloadCsv(
    filename,
    headers.map((label) => ({ label, value: () => "" })),
    [{}],
  );
};

export const uploadCsv = async (api, endpoint, file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(endpoint, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
