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

export const localDateStamp = (date = new Date()) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

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

export const printChartReport = (title, subtitle, charts) => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const renderDonut = (items, total, centerLabel) => {
    const safeItems = items.map((item) => ({
      ...item,
      value: Math.max(0, Number(item.value) || 0),
    }));
    const sum = safeItems.reduce((value, item) => value + item.value, 0);
    const circumference = 2 * Math.PI * 62;
    let offset = 0;
    const rings = safeItems
      .filter((item) => item.value > 0 && sum > 0)
      .map((item) => {
        const length = (item.value / sum) * circumference;
        const ring = `<circle cx="80" cy="80" r="62" fill="none" stroke="${escapeHtml(item.color || "#036A87")}" stroke-width="24" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`;
        offset += length;
        return ring;
      })
      .join("");
    const legend = safeItems
      .map(
        (item) => `<span class="legend-item"><i style="background:${escapeHtml(item.color || "#036A87")}"></i>${escapeHtml(item.label)} (${escapeHtml(item.value)})</span>`,
      )
      .join("");
    const center =
      total === undefined
        ? ""
        : `<circle cx="80" cy="80" r="49" fill="white"/><text x="80" y="77" text-anchor="middle" class="donut-total">${escapeHtml(total)}</text><text x="80" y="96" text-anchor="middle" class="donut-caption">${escapeHtml(centerLabel)}</text>`;
    return `<div class="donut-layout"><div class="donut-wrap"><svg viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(centerLabel || "")}">${rings}${center}</svg></div><div class="legend">${legend}</div></div>`;
  };

  const renderHorizontalBars = (items) => {
    const maxValue = Math.max(...items.map((item) => Number(item.value) || 0), 1);
    const rows = items
      .map((item) => {
        const value = Math.max(0, Number(item.value) || 0);
        const width = Math.max(0, Math.min((value / maxValue) * 100, 100));
        return `<div class="horizontal-row"><div class="chart-label">${escapeHtml(item.label)}</div><div class="horizontal-track"><div class="horizontal-bar" style="width:${width}%;background:${escapeHtml(item.color || "#036A87")}"></div></div><div class="chart-value">${escapeHtml(value)}</div></div>`;
      })
      .join("");
    return `<div class="horizontal-chart">${rows}</div>`;
  };

  const renderColumns = (items) => {
    const maxValue = Math.max(...items.map((item) => Number(item.value) || 0), 1);
    const columns = items
      .map((item) => {
        const value = Math.max(0, Number(item.value) || 0);
        const height = Math.max(0, (value / maxValue) * 100);
        return `<div class="column-item"><div class="column-value">${escapeHtml(value)}</div><div class="column-track"><div class="column-bar" style="height:${height}%;background:${escapeHtml(item.color || "#036A87")}"></div></div><div class="column-label">${escapeHtml(item.label)}</div></div>`;
      })
      .join("");
    return `<div class="column-chart">${columns}</div>`;
  };

  const chartsHtml = charts
    .map(({ title: chartTitle, items = [], type = "horizontal-bar", total, centerLabel }) => {
      const chartHtml =
        type === "donut"
          ? renderDonut(items, total, centerLabel)
          : type === "column"
            ? renderColumns(items)
            : renderHorizontalBars(items);
      return `
        <section>
          <h2>${escapeHtml(chartTitle)}</h2>
          <div class="chart">${items.length ? chartHtml : `<p>${escapeHtml(t("لا توجد بيانات"))}</p>`}</div>
        </section>`;
    })
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
          h2 { font-size: 16px; margin: 0 0 12px; }
          .chart { min-height: 145px; }
          .horizontal-chart { display: grid; gap: 10px; padding: 4px 0; }
          .horizontal-row { display: grid; grid-template-columns: minmax(100px, 1fr) 3fr 52px; gap: 10px; align-items: center; }
          .chart-label { font-size: 12px; }
          .horizontal-track { height: 18px; overflow: hidden; border-radius: 4px; background: #e5e7eb; }
          .horizontal-bar { height: 100%; min-width: 1px; border-radius: 4px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .chart-value { font-size: 12px; font-weight: bold; text-align: end; }
          .donut-layout { display: flex; align-items: center; justify-content: center; gap: 24px; min-height: 190px; }
          .donut-wrap { width: 180px; height: 180px; flex: 0 0 auto; }
          .donut-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
          .donut-wrap svg text { transform: rotate(90deg); transform-origin: 80px 80px; }
          .donut-total { font-size: 18px; font-weight: bold; fill: #111827; }
          .donut-caption { font-size: 8px; fill: #6b7280; }
          .legend { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
          .legend-item { display: flex; align-items: center; gap: 7px; }
          .legend-item i { width: 9px; height: 9px; border-radius: 50%; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .column-chart { display: flex; align-items: stretch; justify-content: space-around; gap: 24px; height: 185px; padding: 8px 12px 0; border-bottom: 1px solid #d1d5db; background-image: linear-gradient(to bottom, transparent calc(25% - 1px), #e5e7eb 25%, transparent calc(25% + 1px), transparent calc(50% - 1px), #e5e7eb 50%, transparent calc(50% + 1px), transparent calc(75% - 1px), #e5e7eb 75%, transparent calc(75% + 1px)); }
          .column-item { display: grid; grid-template-rows: 18px 1fr 24px; align-items: end; justify-items: center; flex: 1; min-width: 50px; }
          .column-value { font-size: 10px; font-weight: bold; }
          .column-track { display: flex; align-items: end; justify-content: center; width: 100%; height: 100%; }
          .column-bar { width: 24px; min-height: 1px; border-radius: 7px 7px 0 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .column-label { align-self: end; text-align: center; font-size: 11px; }
          @page { size: A4 landscape; margin: 14mm; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(subtitle)}</p>
        ${chartsHtml}
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
