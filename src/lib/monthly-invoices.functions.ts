// Monthly tuition renewal — generates month 2..N invoices for parents on the
// monthly plan. Triggered by pg_cron on the 1st of each month. Also exposed
// as an admin-callable server fn for manual runs.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSeasonInfo } from "./season";
import {
  SEMESTER_MONTHS,
  CASH_DISCOUNT_PER_CLASS_CENTS,
  seasonLabel,
  defaultDueDateISO,
} from "./business";

function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d = new Date()): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

type RenewalResult = {
  ok: true;
  month: string;
  parents_considered: number;
  invoices_created: number;
  deduped: number;
  errors: Array<{ parent_id: string; message: string }>;
};

/**
 * For each parent who has any active enrollment AND whose most recent invoice
 * was configured monthly (tuition_plan='monthly' AND invoice_preference='monthly'),
 * generate a one-month tuition invoice for the current calendar month.
 * Idempotent per (parent, month) via idempotency_key = `monthly-{parent}-{YYYY-MM}`.
 */
export async function generateMonthlyRenewalInvoices(now: Date = new Date()): Promise<RenewalResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ensureInvoicePaymentLink } = await import("./payments.functions");
  const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");

  const season = getSeasonInfo();
  const seasonYear = season.seasonYear;
  const monthKey = currentMonthKey(now);
  const label = monthLabel(now);

  // Find parents on monthly plan (based on their most recent invoice this season)
  const { data: recentInvoices, error: invErr } = await supabaseAdmin
    .from("invoices")
    .select("id, parent_id, tuition_plan, invoice_preference, cash_payment, parent_email, parent_name, created_at")
    .eq("semester_year", seasonYear)
    .order("created_at", { ascending: false });
  if (invErr) throw new Error(invErr.message);

  const monthlyParents = new Map<string, { email: string; name: string; cash: boolean }>();
  for (const row of (recentInvoices ?? []) as any[]) {
    if (monthlyParents.has(row.parent_id)) continue;
    if (row.tuition_plan === "monthly" && row.invoice_preference === "monthly") {
      monthlyParents.set(row.parent_id, {
        email: row.parent_email, name: row.parent_name, cash: !!row.cash_payment,
      });
    }
  }

  const result: RenewalResult = {
    ok: true, month: monthKey, parents_considered: monthlyParents.size,
    invoices_created: 0, deduped: 0, errors: [],
  };

  for (const [parentId, meta] of monthlyParents) {
    try {
      // Dedupe
      const idem = `monthly-${parentId}-${monthKey}`;
      const { data: existing } = await supabaseAdmin
        .from("invoices").select("id").eq("idempotency_key", idem).maybeSingle();
      if (existing) { result.deduped++; continue; }

      // Load active enrollments for this parent's students
      const { data: students } = await supabaseAdmin
        .from("students").select("id, first_name, last_name").eq("parent_id", parentId);
      const studentIds = (students ?? []).map((s: any) => s.id);
      if (studentIds.length === 0) continue;

      const { data: enrolls } = await supabaseAdmin
        .from("enrollments")
        .select("id, student_id, class_id, status, class_schedule:class_id(id, class_name, monthly_tuition_cents)")
        .in("student_id", studentIds)
        .eq("status", "active");
      const active = (enrolls ?? []).filter((e: any) => e.class_schedule?.monthly_tuition_cents);
      if (active.length === 0) continue;

      // Build line items: 1 month of tuition per active class
      const lines: any[] = [];
      let sort = 0;
      for (const e of active as any[]) {
        const stu = (students as any[]).find((s) => s.id === e.student_id);
        const stuName = stu ? `${stu.first_name} ${stu.last_name}`.trim() : "Student";
        lines.push({
          student_id: e.student_id,
          student_name: stuName,
          class_id: e.class_id,
          category: "tuition_monthly",
          description: `${e.class_schedule.class_name} — Monthly Tuition (${label})`,
          months: 1,
          unit_amount_cents: e.class_schedule.monthly_tuition_cents,
          amount_cents: e.class_schedule.monthly_tuition_cents,
          sort_order: sort++,
        });
      }
      const subtotal = lines.reduce((s, l) => s + l.amount_cents, 0);
      let discount = 0;
      if (meta.cash) {
        discount = CASH_DISCOUNT_PER_CLASS_CENTS * active.length;
        lines.push({
          student_id: null, student_name: null, class_id: null,
          category: "discount",
          description: `Cash Discount — $${(CASH_DISCOUNT_PER_CLASS_CENTS / 100).toFixed(2)} × ${active.length} class${active.length === 1 ? "" : "es"}`,
          months: null,
          unit_amount_cents: -CASH_DISCOUNT_PER_CLASS_CENTS,
          amount_cents: -discount,
          sort_order: sort++,
        });
      }
      const total = subtotal - discount;
      if (total <= 0) continue;

      // Allocate invoice number
      const { data: numRes, error: numErr } = await supabaseAdmin.rpc("next_invoice_number");
      if (numErr) throw new Error(numErr.message);
      const invoiceNumber = numRes as unknown as string;

      const { data: inv, error: insErr } = await supabaseAdmin
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          parent_id: parentId,
          parent_email: meta.email,
          parent_name: meta.name,
          semester_year: seasonYear,
          semester_label: seasonLabel(seasonYear),
          tuition_plan: "monthly",
          invoice_preference: "monthly",
          cash_payment: meta.cash,
          subtotal_cents: subtotal,
          discount_cents: discount,
          total_cents: total,
          status: "new",
          due_date: defaultDueDateISO(),
          notes: `Auto-generated tuition invoice for ${label}.`,
          idempotency_key: idem,
          renewal_month: monthKey,
        } as never)
        .select("id, invoice_number")
        .single();
      if (insErr || !inv) throw new Error(insErr?.message ?? "Insert failed");

      const lineRows = lines.map((l) => ({ ...l, invoice_id: inv.id }));
      const { error: linesErr } = await supabaseAdmin.from("invoice_line_items").insert(lineRows as never);
      if (linesErr) throw new Error(linesErr.message);

      // Best-effort payment link + email
      let paymentUrl: string | null = null;
      try {
        const link = await ensureInvoicePaymentLink(inv.id);
        if (!("error" in link)) paymentUrl = link.payment_url;
      } catch { /* noop */ }

      try {
        const { data: full } = await supabaseAdmin
          .from("invoices")
          .select("*, line_items:invoice_line_items(*)")
          .eq("id", inv.id).single();
        const flat: any = full;
        await enqueueTransactionalEmail({
          templateName: "invoice-sent",
          recipientEmail: meta.email,
          idempotencyKey: `invoice-sent-${inv.id}`,
          templateData: {
            invoice_number: flat.invoice_number,
            invoice_date: flat.invoice_date,
            due_date: flat.due_date,
            parent_name: flat.parent_name,
            semester_label: flat.semester_label,
            tuition_plan: flat.tuition_plan,
            invoice_preference: flat.invoice_preference,
            cash_payment: flat.cash_payment,
            subtotal_cents: flat.subtotal_cents,
            discount_cents: flat.discount_cents,
            total_cents: flat.total_cents,
            line_items: (flat.line_items ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order).map((l: any) => ({
              description: l.description, student_name: l.student_name,
              amount_cents: l.amount_cents, category: l.category,
            })),
            payment_url: paymentUrl,
          },
        });
        await supabaseAdmin.from("invoices").update({
          emailed_at: new Date().toISOString(),
          status: "sent",
          sent_at: new Date().toISOString(),
        } as never).eq("id", inv.id);
      } catch (e) {
        console.error("[monthly-renewal] email failed for", parentId, e);
      }

      result.invoices_created++;
    } catch (e: any) {
      result.errors.push({ parent_id: parentId, message: e?.message ?? String(e) });
    }
  }

  return result;
}

// Admin-callable manual trigger (for testing / catch-up).
export const runMonthlyRenewalManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("Forbidden");
    return await generateMonthlyRenewalInvoices();
  });

export const MONTHLY_RENEWAL_MAX_MONTHS = SEMESTER_MONTHS;