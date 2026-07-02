import { BUSINESS, PAYMENT_METHODS, PAYMENT_INSTRUCTIONS, INVOICE_FOOTER, centsToUSD } from "./business";
import type { InvoiceWithLines, InvoiceLineItem } from "./invoices.functions";
import logoAsset from "@/assets/logo.png.asset.json";

const LOGO_URL: string =
  typeof window !== "undefined" ? new URL(logoAsset.url, window.location.origin).toString() : logoAsset.url;
const DEFAULT_INSTRUCTOR = "Melissa";

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function fmtDate(iso: string): string {
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, {
    month: "long", day: "numeric", year: "numeric",
  });
}

function statusLabel(s: string): string {
  if (s === "new") return "New";
  if (s === "sent") return "Sent";
  if (s === "paid") return "Paid";
  if (s === "overdue") return "Overdue";
  if (s === "cancelled") return "Cancelled";
  return s;
}

function pad(s: string, n: number, right = false): string {
  if (s.length >= n) return s;
  const p = " ".repeat(n - s.length);
  return right ? p + s : s + p;
}

/** Plaintext version suitable for pasting into an email or message. */
export function invoiceAsText(inv: InvoiceWithLines): string {
  const lines: string[] = [];
  lines.push(BUSINESS.name);
  lines.push(BUSINESS.addressLine1);
  lines.push(BUSINESS.addressLine2);
  lines.push(`Phone: ${BUSINESS.phone}`);
  lines.push(`Email: ${BUSINESS.email}`);
  lines.push(`Website: ${BUSINESS.website}`);
  lines.push("");
  lines.push(`INVOICE ${inv.invoice_number}`);
  lines.push(`Date: ${fmtDate(inv.invoice_date)}   Due: ${fmtDate(inv.due_date)}`);
  lines.push(`Status: ${statusLabel(inv.status)}${inv.cash_payment ? " (Payment Pending – Cash)" : ""}`);
  lines.push("");
  lines.push(`Bill To: ${inv.parent_name} <${inv.parent_email}>`);
  lines.push(`Semester: ${inv.semester_label}`);
  lines.push(`Instructor: ${DEFAULT_INSTRUCTOR}`);
  lines.push(`Tuition Plan: ${inv.tuition_plan === "monthly" ? "Monthly" : "Semester (one payment)"}`);
  lines.push(`Invoice Preference: ${inv.invoice_preference === "monthly" ? "Monthly Invoices" : "One Semester Invoice"}`);
  lines.push("");
  lines.push("---------------------------------------------------------------");
  lines.push(`${pad("Description", 46)} ${pad("Amount", 12, true)}`);
  lines.push("---------------------------------------------------------------");
  const items = (inv.line_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  for (const li of items) {
    const desc = (li.student_name ? `${li.student_name}: ` : "") + li.description;
    const chunks = wrap(desc, 46);
    chunks.forEach((c, i) => {
      lines.push(`${pad(c, 46)} ${i === chunks.length - 1 ? pad(centsToUSD(li.amount_cents), 12, true) : pad("", 12, true)}`);
    });
  }
  lines.push("---------------------------------------------------------------");
  lines.push(`${pad("Subtotal", 46)} ${pad(centsToUSD(inv.subtotal_cents), 12, true)}`);
  if (inv.discount_cents > 0) {
    lines.push(`${pad("Cash Discount", 46)} ${pad("-" + centsToUSD(inv.discount_cents), 12, true)}`);
  }
  lines.push(`${pad("TOTAL DUE", 46)} ${pad(centsToUSD(inv.total_cents), 12, true)}`);
  lines.push("");
  lines.push("Payment Methods:");
  for (const m of PAYMENT_METHODS) lines.push(`  • ${m.label}: ${m.detail}`);
  lines.push("");
  for (const p of PAYMENT_INSTRUCTIONS) lines.push(p);
  lines.push("");
  lines.push(INVOICE_FOOTER);
  if (inv.notes) {
    lines.push("");
    lines.push(`Notes: ${inv.notes}`);
  }
  return lines.join("\n");
}

function wrap(s: string, w: number): string[] {
  if (s.length <= w) return [s];
  const words = s.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const word of words) {
    if ((cur + (cur ? " " : "") + word).length > w) {
      if (cur) out.push(cur);
      cur = word;
    } else {
      cur = cur ? cur + " " + word : word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// -----------------------------------------------------------------------------
// PDF generator (client-side, jsPDF)
// -----------------------------------------------------------------------------
export async function downloadInvoicePdf(inv: InvoiceWithLines): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = M;

  // Header logo (top-left)
  const logoDataUrl = await fetchLogoDataUrl();
  const logoSize = 64;
  const headerTextX = logoDataUrl ? M + logoSize + 12 : M;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", M, y - 4, logoSize, logoSize);
    } catch { /* ignore image failures */ }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(BUSINESS.name, headerTextX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 16;
  doc.text(BUSINESS.addressLine1, headerTextX, y); y += 12;
  doc.text(BUSINESS.addressLine2, headerTextX, y); y += 12;
  doc.text(BUSINESS.phone, headerTextX, y); y += 12;
  doc.text(BUSINESS.email, headerTextX, y); y += 12;
  doc.text(BUSINESS.website, headerTextX, y);
  // Ensure header cursor sits below logo before divider
  if (logoDataUrl) y = Math.max(y, M + logoSize - 8);

  // Invoice meta (right side)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("INVOICE", W - M, M + 4, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`#${inv.invoice_number}`, W - M, M + 24, { align: "right" });
  doc.setFontSize(10);
  doc.text(`Date: ${fmtDate(inv.invoice_date)}`, W - M, M + 40, { align: "right" });
  doc.text(`Due:  ${fmtDate(inv.due_date)}`, W - M, M + 54, { align: "right" });
  doc.text(`Status: ${statusLabel(inv.status)}${inv.cash_payment ? " (Cash pending)" : ""}`, W - M, M + 68, { align: "right" });

  y += 32;
  doc.setDrawColor(200);
  doc.line(M, y, W - M, y);
  y += 20;

  // Bill To
  doc.setFont("helvetica", "bold");
  doc.text("Bill To", M, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(inv.parent_name, M, y); y += 12;
  doc.text(inv.parent_email, M, y); y += 12;
  doc.text(`Semester: ${inv.semester_label}`, M, y); y += 12;
  doc.text(`Instructor: ${DEFAULT_INSTRUCTOR}`, M, y); y += 12;
  doc.text(`Tuition Plan: ${inv.tuition_plan === "monthly" ? "Monthly" : "Semester (one payment)"}`, M, y); y += 12;
  doc.text(`Invoice Preference: ${inv.invoice_preference === "monthly" ? "Monthly Invoices" : "One Semester Invoice"}`, M, y);

  y += 20;
  doc.line(M, y, W - M, y);
  y += 18;

  // Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description", M, y);
  doc.text("Amount", W - M, y, { align: "right" });
  y += 8;
  doc.line(M, y, W - M, y);
  y += 12;
  doc.setFont("helvetica", "normal");

  const items = (inv.line_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  for (const li of items) {
    const desc = (li.student_name ? `${li.student_name}: ` : "") + li.description;
    const wrapped = doc.splitTextToSize(desc, W - M * 2 - 100);
    doc.text(wrapped, M, y);
    doc.text(centsToUSD(li.amount_cents), W - M, y, { align: "right" });
    y += 14 * wrapped.length;
    if (y > 720) { doc.addPage(); y = M; }
  }

  y += 6;
  doc.line(W - M - 200, y, W - M, y);
  y += 14;
  doc.text("Subtotal", W - M - 200, y);
  doc.text(centsToUSD(inv.subtotal_cents), W - M, y, { align: "right" });
  y += 14;
  if (inv.discount_cents > 0) {
    doc.text("Cash Discount", W - M - 200, y);
    doc.text("-" + centsToUSD(inv.discount_cents), W - M, y, { align: "right" });
    y += 14;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL DUE", W - M - 200, y);
  doc.text(centsToUSD(inv.total_cents), W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  y += 24;
  if (y > 660) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold");
  doc.text("Payment Methods", M, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  for (const m of PAYMENT_METHODS) {
    doc.text(`•  ${m.label}: ${m.detail}`, M, y);
    y += 12;
  }
  y += 8;
  const instr = doc.splitTextToSize(PAYMENT_INSTRUCTIONS.join(" "), W - M * 2);
  doc.text(instr, M, y);
  y += 14 * instr.length + 6;
  const footer = doc.splitTextToSize(INVOICE_FOOTER, W - M * 2);
  doc.text(footer, M, y);

  doc.save(`${inv.invoice_number}.pdf`);
}

/** Print a printable HTML view of the invoice in a new window. */
export function printInvoice(inv: InvoiceWithLines): void {
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) return;
  const rows = (inv.line_items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((li: InvoiceLineItem) =>
      `<tr>
         <td style="padding:6px 8px;border-bottom:1px solid #eee;">${(li.student_name ? `<strong>${escape(li.student_name)}:</strong> ` : "")}${escape(li.description)}</td>
         <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${centsToUSD(li.amount_cents)}</td>
       </tr>`,
    ).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${inv.invoice_number}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;margin:32px;} h1{margin:0;} .muted{color:#666;font-size:12px;} table{width:100%;border-collapse:collapse;margin-top:16px;} th{text-align:left;padding:6px 8px;border-bottom:2px solid #333;font-size:12px;text-transform:uppercase;} .totals td{padding:4px 8px;} .total{font-size:16px;font-weight:700;}</style>
  </head><body>
    <div style="display:flex;justify-content:space-between;">
      <div><h1>${BUSINESS.name}</h1>
        <div class="muted">${BUSINESS.addressLine1}<br>${BUSINESS.addressLine2}<br>${BUSINESS.phone}<br>${BUSINESS.email}<br>${BUSINESS.website}</div>
      </div>
      <div style="text-align:right;">
        <h1>INVOICE</h1>
        <div>#${inv.invoice_number}</div>
        <div class="muted">Date: ${fmtDate(inv.invoice_date)}<br>Due: ${fmtDate(inv.due_date)}<br>Status: ${statusLabel(inv.status)}${inv.cash_payment ? " (Cash pending)" : ""}</div>
      </div>
    </div>
    <hr>
    <div><strong>Bill To</strong><br>${escape(inv.parent_name)}<br>${escape(inv.parent_email)}</div>
    <div class="muted" style="margin-top:8px;">Semester: ${escape(inv.semester_label)} · Tuition Plan: ${inv.tuition_plan === "monthly" ? "Monthly" : "Semester (one payment)"} · Invoice Preference: ${inv.invoice_preference === "monthly" ? "Monthly Invoices" : "One Semester Invoice"}</div>
    <table>
      <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals" style="width:auto;margin-left:auto;margin-top:12px;">
      <tr><td>Subtotal</td><td style="text-align:right;">${centsToUSD(inv.subtotal_cents)}</td></tr>
      ${inv.discount_cents > 0 ? `<tr><td>Cash Discount</td><td style="text-align:right;">-${centsToUSD(inv.discount_cents)}</td></tr>` : ""}
      <tr class="total"><td>Total Due</td><td style="text-align:right;">${centsToUSD(inv.total_cents)}</td></tr>
    </table>
    <h3 style="margin-top:24px;">Payment Methods</h3>
    <ul>${PAYMENT_METHODS.map((m) => `<li><strong>${m.label}:</strong> ${escape(m.detail)}</li>`).join("")}</ul>
    <p class="muted">${PAYMENT_INSTRUCTIONS.map(escape).join(" ")}</p>
    <p>${escape(INVOICE_FOOTER)}</p>
    <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}