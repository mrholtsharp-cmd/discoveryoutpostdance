import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportPdfReport(opts: {
  title: string;
  filename: string;
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
  subtitle?: string;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
  doc.setFontSize(16);
  doc.text(opts.title, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    opts.subtitle ?? `Generated ${new Date().toLocaleString()}  ·  Discovery Outpost`,
    40,
    58,
  );
  autoTable(doc, {
    startY: 78,
    head: [opts.columns],
    body: opts.rows.map((r) => r.map((v) => (v == null ? "" : String(v)))),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [33, 33, 33] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
  });
  doc.save(opts.filename);
}