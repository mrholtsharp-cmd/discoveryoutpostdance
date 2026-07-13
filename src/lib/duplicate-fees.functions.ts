// Duplicate one-time fee detection and cleanup.
//
// A "one-time fee" is any invoice_line_items row with category in
// ('registration_fee', 'recital_fee'). By business rule, each student
// should be charged each such fee at most once per season across all
// non-cancelled invoices. This module:
//   - Audits current invoices to find duplicate one-time fee lines.
//   - Preserves the earliest valid invoice's fee line as canonical.
//   - Removes duplicate lines from later Draft (new) invoices automatically,
//     recalculates totals, and invalidates any stale Stripe link.
//   - Flags Sent invoices for admin confirmation; correction is a separate
//     per-invoice call that recalculates, regenerates the Stripe link,
//     and resends the invoice email.
//   - Only flags Paid invoices — admin uses the existing refund workflow.
//
// Idempotent: repeat runs are no-ops once duplicates are gone.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureInvoicePaymentLink, invalidateInvoicePaymentLink } from "./payments.functions";

const ONE_TIME_CATEGORIES = ["registration_fee", "recital_fee"] as const;
type OneTimeCategory = (typeof ONE_TIME_CATEGORIES)[number];

const DRAFT_FIX_MARKER = "[dup-fee-fix-draft]";
const SENT_FIX_MARKER = "[dup-fee-fix-sent]";
const PAID_REVIEW_MARKER = "[dup-fee-paid-reviewed]";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

type LineRow = {
  id: string;
  invoice_id: string;
  student_id: string | null;
  category: string;
  amount_cents: number;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  cash_payment: boolean;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  semester_year: number | null;
  parent_name: string | null;
  parent_email: string | null;
  created_at: string;
  admin_notes: string | null;
  stripe_session_id: string | null;
  payment_url: string | null;
};

type DuplicateLine = {
  line_id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_status: string;
  cash_payment: boolean;
  parent_name: string | null;
  parent_email: string | null;
  student_id: string;
  category: OneTimeCategory;
  amount_cents: number;
  semester_year: number;
  // The canonical (first, kept) invoice for this student+category+season.
  canonical_invoice_id: string;
  canonical_invoice_number: string;
};

export type DuplicateFeePreview = {
  invoices_checked: number;
  duplicate_registration_fee_lines: number;
  duplicate_recital_fee_lines: number;
  draft_lines_to_remove: DuplicateLine[];
  sent_lines_needing_review: DuplicateLine[];
  paid_lines_needing_review: DuplicateLine[];
  other_status_lines: DuplicateLine[]; // overdue/refunded/partial_refund
  stripe_links_to_regenerate: number; // draft non-cash invoices w/ existing link that will change amount
};

async function loadCandidates(): Promise<{ invoices: InvoiceRow[]; lines: LineRow[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: inv, error: e1 } = await supabaseAdmin
    .from("invoices")
    .select(
      "id, invoice_number, status, cash_payment, subtotal_cents, discount_cents, total_cents, semester_year, parent_name, parent_email, created_at, admin_notes, stripe_session_id, payment_url",
    )
    .neq("status", "cancelled");
  if (e1) throw new Error(e1.message);
  const invoices = (inv ?? []) as unknown as InvoiceRow[];
  const ids = invoices.map((r) => r.id);
  if (ids.length === 0) return { invoices, lines: [] };
  const { data: li, error: e2 } = await supabaseAdmin
    .from("invoice_line_items")
    .select("id, invoice_id, student_id, category, amount_cents")
    .in("invoice_id", ids)
    .in("category", ONE_TIME_CATEGORIES as unknown as string[]);
  if (e2) throw new Error(e2.message);
  return { invoices, lines: (li ?? []) as unknown as LineRow[] };
}

function categorize(invoices: InvoiceRow[], lines: LineRow[]): DuplicateFeePreview {
  const byId = new Map(invoices.map((r) => [r.id, r] as const));

  // Group lines by (student, category, season). Earliest invoice wins.
  type Group = { key: string; entries: Array<LineRow & { invoice: InvoiceRow }>; };
  const groups = new Map<string, Group>();
  for (const l of lines) {
    const inv = byId.get(l.invoice_id);
    if (!inv || !l.student_id || inv.semester_year == null) continue;
    const key = `${l.student_id}::${l.category}::${inv.semester_year}`;
    const g = groups.get(key) ?? { key, entries: [] };
    g.entries.push({ ...l, invoice: inv });
    groups.set(key, g);
  }

  const preview: DuplicateFeePreview = {
    invoices_checked: invoices.length,
    duplicate_registration_fee_lines: 0,
    duplicate_recital_fee_lines: 0,
    draft_lines_to_remove: [],
    sent_lines_needing_review: [],
    paid_lines_needing_review: [],
    other_status_lines: [],
    stripe_links_to_regenerate: 0,
  };

  const draftInvoicesAffected = new Set<string>();

  for (const g of groups.values()) {
    if (g.entries.length < 2) continue;
    // Sort earliest-first: (invoice.created_at asc, invoice_number asc, line.id asc).
    g.entries.sort((a, b) => {
      const t = a.invoice.created_at.localeCompare(b.invoice.created_at);
      if (t !== 0) return t;
      const n = a.invoice.invoice_number.localeCompare(b.invoice.invoice_number);
      if (n !== 0) return n;
      return a.id.localeCompare(b.id);
    });
    const canonical = g.entries[0];
    const dups = g.entries.slice(1);
    for (const d of dups) {
      const category = d.category as OneTimeCategory;
      if (category === "registration_fee") preview.duplicate_registration_fee_lines++;
      else preview.duplicate_recital_fee_lines++;
      const dl: DuplicateLine = {
        line_id: d.id,
        invoice_id: d.invoice_id,
        invoice_number: d.invoice.invoice_number,
        invoice_status: d.invoice.status,
        cash_payment: d.invoice.cash_payment,
        parent_name: d.invoice.parent_name,
        parent_email: d.invoice.parent_email,
        student_id: d.student_id!,
        category,
        amount_cents: d.amount_cents,
        semester_year: d.invoice.semester_year!,
        canonical_invoice_id: canonical.invoice_id,
        canonical_invoice_number: canonical.invoice.invoice_number,
      };
      switch (d.invoice.status) {
        case "new":
          preview.draft_lines_to_remove.push(dl);
          if (!d.invoice.cash_payment && (d.invoice.stripe_session_id || d.invoice.payment_url)) {
            draftInvoicesAffected.add(d.invoice.id);
          }
          break;
        case "sent":
        case "overdue":
          preview.sent_lines_needing_review.push(dl);
          break;
        case "paid":
          preview.paid_lines_needing_review.push(dl);
          break;
        default:
          preview.other_status_lines.push(dl);
      }
    }
  }
  preview.stripe_links_to_regenerate = draftInvoicesAffected.size;
  return preview;
}

export const previewDuplicateFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DuplicateFeePreview> => {
    await ensureAdmin(context);
    const { invoices, lines } = await loadCandidates();
    return categorize(invoices, lines);
  });

// -----------------------------------------------------------------------------
// Draft cleanup: remove duplicate one-time fee lines from Draft (new) invoices,
// recalculate totals, invalidate stale Stripe link, generate fresh one for
// non-cash invoices. Never touches Sent/Paid/Cancelled/Refunded.
// -----------------------------------------------------------------------------
async function recalcInvoice(invoiceId: string): Promise<{ new_total: number; had_link: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: inv } = await supabaseAdmin
    .from("invoices").select("id, cash_payment, stripe_session_id, payment_url").eq("id", invoiceId).single();
  const { data: rows } = await supabaseAdmin
    .from("invoice_line_items").select("amount_cents, category").eq("invoice_id", invoiceId);
  let subtotal = 0;
  let discount = 0;
  for (const r of ((rows ?? []) as any[])) {
    if (r.category === "discount") discount += Math.abs(r.amount_cents);
    else subtotal += r.amount_cents;
  }
  const total = Math.max(0, subtotal - discount);
  const hadLink = !!(inv as any)?.stripe_session_id || !!(inv as any)?.payment_url;
  await supabaseAdmin.from("invoices").update({
    subtotal_cents: subtotal,
    discount_cents: discount,
    total_cents: total,
    updated_at: new Date().toISOString(),
  } as never).eq("id", invoiceId);
  return { new_total: total, had_link: hadLink };
}

function stamp(existing: string | null, marker: string, msg: string): string {
  const line = `${marker} ${msg} on ${new Date().toISOString()}`;
  return existing ? `${existing}\n${line}` : line;
}

export type DraftCleanupResult = {
  draft_invoices_corrected: number;
  duplicate_lines_removed: number;
  stripe_links_regenerated: number;
  errors: Array<{ invoice_number: string; error: string }>;
};

export const runDuplicateFeeCleanupDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal(true) }).parse(d))
  .handler(async ({ context }): Promise<DraftCleanupResult> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invoices, lines } = await loadCandidates();
    const preview = categorize(invoices, lines);
    const byInvoice = new Map<string, DuplicateLine[]>();
    for (const d of preview.draft_lines_to_remove) {
      const arr = byInvoice.get(d.invoice_id) ?? [];
      arr.push(d);
      byInvoice.set(d.invoice_id, arr);
    }
    const invById = new Map(invoices.map((r) => [r.id, r] as const));

    const result: DraftCleanupResult = {
      draft_invoices_corrected: 0,
      duplicate_lines_removed: 0,
      stripe_links_regenerated: 0,
      errors: [],
    };

    for (const [invoiceId, dups] of byInvoice) {
      const inv = invById.get(invoiceId);
      if (!inv) continue;
      try {
        const ids = dups.map((d) => d.line_id);
        const { error: delErr } = await supabaseAdmin
          .from("invoice_line_items").delete().in("id", ids);
        if (delErr) throw new Error(delErr.message);
        result.duplicate_lines_removed += ids.length;

        // Invalidate old link (also updates stripe fields to null).
        if (!inv.cash_payment && (inv.stripe_session_id || inv.payment_url)) {
          await invalidateInvoicePaymentLink(invoiceId);
        }

        const { new_total } = await recalcInvoice(invoiceId);

        // Generate a fresh link for non-cash drafts with a positive total,
        // matching the corrected amount.
        if (!inv.cash_payment && new_total > 0) {
          const link = await ensureInvoicePaymentLink(invoiceId, { forceNew: true });
          if (!("error" in link)) result.stripe_links_regenerated++;
        }

        await supabaseAdmin.from("invoices").update({
          admin_notes: stamp(inv.admin_notes, DRAFT_FIX_MARKER, `removed ${ids.length} duplicate fee line(s); canonical=${dups[0].canonical_invoice_number}`),
          updated_at: new Date().toISOString(),
        } as never).eq("id", invoiceId);

        result.draft_invoices_corrected++;
      } catch (e: any) {
        result.errors.push({ invoice_number: inv.invoice_number, error: e?.message ?? String(e) });
      }
    }
    return result;
  });

// -----------------------------------------------------------------------------
// Sent-invoice correction (per-invoice, admin confirms).
// -----------------------------------------------------------------------------
export const correctSentInvoiceDuplicateFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().uuid(), resendEmail: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; removed: number; new_total_cents: number; link_regenerated: boolean; emailed: boolean } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invRow } = await supabaseAdmin
      .from("invoices")
      .select("id, status, cash_payment, admin_notes, parent_email, invoice_number")
      .eq("id", data.invoiceId).maybeSingle();
    const inv = invRow as any;
    if (!inv) return { error: "Invoice not found" };
    if (inv.status !== "sent" && inv.status !== "overdue") {
      return { error: `Only Sent/Overdue invoices can be corrected here (was ${inv.status}).` };
    }
    const { invoices, lines } = await loadCandidates();
    const preview = categorize(invoices, lines);
    const dups = preview.sent_lines_needing_review.filter((d) => d.invoice_id === data.invoiceId);
    if (dups.length === 0) return { error: "No duplicate one-time fees found on this invoice." };

    const ids = dups.map((d) => d.line_id);
    const { error: delErr } = await supabaseAdmin.from("invoice_line_items").delete().in("id", ids);
    if (delErr) return { error: delErr.message };

    await invalidateInvoicePaymentLink(data.invoiceId);
    const { new_total } = await recalcInvoice(data.invoiceId);

    let linkOk = false;
    if (!inv.cash_payment && new_total > 0) {
      const link = await ensureInvoicePaymentLink(data.invoiceId, { forceNew: true });
      linkOk = !("error" in link);
    }

    await supabaseAdmin.from("invoices").update({
      admin_notes: stamp(inv.admin_notes, SENT_FIX_MARKER, `removed ${ids.length} duplicate fee line(s); canonical=${dups[0].canonical_invoice_number}; new_total=${(new_total / 100).toFixed(2)}`),
      updated_at: new Date().toISOString(),
    } as never).eq("id", data.invoiceId);

    // Resend corrected email (best-effort).
    let emailed = false;
    if (data.resendEmail !== false) {
      try {
        const { data: fresh } = await supabaseAdmin
          .from("invoices").select("*, line_items:invoice_line_items(*)").eq("id", data.invoiceId).single();
        const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
        const f: any = fresh;
        await enqueueTransactionalEmail({
          templateName: "invoice-sent",
          recipientEmail: f.parent_email,
          idempotencyKey: `invoice-dup-fix-${data.invoiceId}-${Date.now()}`,
          templateData: {
            invoice_number: f.invoice_number,
            invoice_date: f.invoice_date,
            due_date: f.due_date,
            parent_name: f.parent_name,
            semester_label: f.semester_label,
            tuition_plan: f.tuition_plan,
            invoice_preference: f.invoice_preference,
            cash_payment: f.cash_payment,
            subtotal_cents: f.subtotal_cents,
            discount_cents: f.discount_cents,
            total_cents: f.total_cents,
            line_items: (f.line_items ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order).map((l: any) => ({
              description: l.description, student_name: l.student_name, amount_cents: l.amount_cents, category: l.category,
            })),
            payment_url: f.payment_url,
            business: (await import("./business")).BUSINESS,
          },
        });
        await supabaseAdmin.from("invoices").update({ emailed_at: new Date().toISOString() } as never).eq("id", data.invoiceId);
        emailed = true;
      } catch { /* record kept via admin_notes */ }
    }

    return { ok: true, removed: ids.length, new_total_cents: new_total, link_regenerated: linkOk, emailed };
  });

// -----------------------------------------------------------------------------
// Paid-invoice review: annotate; admin uses refunds workflow separately.
// -----------------------------------------------------------------------------
export const markPaidDuplicateReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      invoiceId: z.string().uuid(),
      action: z.enum(["credit_next_invoice", "refund_pending", "reviewed_no_action"]),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin.from("invoices").select("admin_notes").eq("id", data.invoiceId).maybeSingle();
    if (!inv) return { error: "Invoice not found" };
    const msg = `${data.action}${data.note ? ` — ${data.note}` : ""}`;
    await supabaseAdmin.from("invoices").update({
      admin_notes: stamp((inv as any).admin_notes, PAID_REVIEW_MARKER, msg),
      updated_at: new Date().toISOString(),
    } as never).eq("id", data.invoiceId);
    return { ok: true };
  });