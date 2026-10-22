import ExcelJS from "exceljs";
import { getLanguage, t } from "@/i18n";

export const downloadXlsx = async (filename, sheets) => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  sheets.forEach(({ name, rows }) => {
    const worksheetName = name
      .split("")
      .map((character) =>
        ["*", "?", ":", "\\", "/", "[", "]"].includes(character)
          ? " "
          : character,
      )
      .join("")
      .slice(0, 31);
    const worksheet = workbook.addWorksheet(worksheetName, {
      views: [{ rightToLeft: getLanguage() === "ar" }],
    });
    rows.forEach((row) => worksheet.addRow(row));
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF036A87" },
    };
    worksheet.columns.forEach((column) => {
      const longest = column.values.reduce(
        (width, value) => Math.max(width, String(value ?? "").length),
        10,
      );
      column.width = Math.min(longest + 2, 42);
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const printReport = (title, subtitle, sections) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const sectionsHtml = sections
    .map(
      ({ title: sectionTitle, headers, rows }) => `
        <section>
          <h2>${escapeHtml(sectionTitle)}</h2>
          <table>
            <thead><tr>${headers
              .map((header) => `<th>${escapeHtml(header)}</th>`)
              .join("")}</tr></thead>
            <tbody>${
              rows.length
                ? rows
                    .map(
                      (row) =>
                        `<tr>${row
                          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
                          .join("")}</tr>`,
                    )
                    .join("")
                : `<tr><td colspan="${headers.length}">${escapeHtml(t("لا توجد بيانات"))}</td></tr>`
            }</tbody>
          </table>
        </section>`,
    )
    .join("");

  printWindow.document.write(`<!doctype html>
    <html lang="${getLanguage()}" dir="${getLanguage() === "ar" ? "rtl" : "ltr"}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; margin: 28px; }
          h1 { margin: 0 0 6px; color: #036a87; }
          .subtitle { margin: 0 0 24px; color: #6b7280; font-size: 13px; }
          section { margin: 0 0 24px; break-inside: avoid; }
          h2 { font-size: 16px; margin: 0 0 8px; }
          table { border-collapse: collapse; width: 100%; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: start; }
          th { background: #f3f4f6; }
          @page { size: A4 landscape; margin: 14mm; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        ${sectionsHtml}
        <script>
          window.onload = () => {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>`);
  printWindow.document.close();
  return true;
};
