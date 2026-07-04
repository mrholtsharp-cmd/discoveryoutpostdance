import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BUSINESS,
  REGISTRATION_FEE_CENTS,
  RECITAL_FEE_CENTS,
  CASH_DISCOUNT_PER_CLASS_CENTS,
  SEMESTER_MONTHS,
  seasonLabel,
  defaultDueDateISO,
} from "./business";
import { getSeasonInfo } from "./season";
import { ensureInvoicePaymentLink, invalidateInvoicePaymentLink } from "./payments.functions";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  student_id: string | null;
  student_name: string | null;
  class_id: string | null;
  category: "tuition_monthly" | "tuition_semester" | "registration_fee" | "recital_fee" | "discount" | "other";
  description: string;
  months: number | null;
  unit_amount_cents: number;
  amount_cents: number;
  sort_order: number;
};

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  parent_id: string;
  parent_email: string;
  parent_name: string;
  semester_year: number;
  semester_label: string;
  tuition_plan: "monthly" | "semester";
  invoice_preference: "monthly" | "semester";
  cash_payment: boolean;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  status: "new" | "sent" | "paid" | "overdue" | "cancelled";
  invoice_date: string;
  due_date: string;
  sent_at: string | null;
  paid_at: string | null;
  emailed_at: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

// -----------------------------------------------------------------------------
// Internal builder — used by registration flow. Not exported as a server fn.
// -----------------------------------------------------------------------------
export type BuildInvoiceInput = {
  parentId: string;
  parentName: string;
  parentEmail: string;
  tuitionPlan: "monthly" | "semester";
  invoicePreference: "monthly" | "semester";
  cashPayment: boolean;
  notes?: string | null;
  idempotencyKey?: string | null;
  // one entry per (student, enrolled class)
  enrollments: Array<{
    student_id: string;
    student_name: string;
    class_id: string;
    class_name: string;
    monthly_cents: number;
    semester_cents: number;
  }>;
};

export async function buildInvoiceForRegistration(input: BuildInvoiceInput): Promise<{ invoiceId: string; invoiceNumber: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const season = getSeasonInfo();
  const seasonYear = season.seasonYear;

  if (input.enrollments.length === 0) return null;

  // Idempotency: if an invoice with this key already exists, return it.
  if (input.idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existing) {
      return { invoiceId: (existing as any).id, invoiceNumber: (existing as any).invoice_number };
    }
  }

  // Build line items
  const lines: Array<Omit<InvoiceLineItem, "id" | "invoice_id"> & { invoice_id?: string }> = [];
  let sort = 0;

  // Group unique students to decide reg + recital fees
  const uniqStudentIds = Array.from(new Set(input.enrollments.map((e) => e.student_id)));

  // 1. Tuition lines
  for (const e of input.enrollments) {
    if (input.tuitionPlan === "monthly") {
      lines.push({
        student_id: e.student_id,
        student_name: e.student_name,
        class_id: e.class_id,
        category: "tuition_monthly",
        description: `${e.class_name} — Monthly Tuition (${SEMESTER_MONTHS} months)`,
        months: SEMESTER_MONTHS,
        unit_amount_cents: e.monthly_cents,
        amount_cents: input.invoicePreference === "monthly" ? e.monthly_cents : e.monthly_cents * SEMESTER_MONTHS,
        sort_order: sort++,
      });
    } else {
      lines.push({
        student_id: e.student_id,
        student_name: e.student_name,
        class_id: e.class_id,
        category: "tuition_semester",
        description: `${e.class_name} — Semester Tuition (one payment)`,
        months: SEMESTER_MONTHS,
        unit_amount_cents: e.semester_cents,
        amount_cents: e.semester_cents,
        sort_order: sort++,
      });
    }
  }

  // 2. Registration fee — once per student per semester
  for (const sid of uniqStudentIds) {
    const { data: existing } = await supabaseAdmin
      .from("student_semester_fees")
      .select("*")
      .eq("student_id", sid)
      .eq("semester_year", seasonYear)
      .maybeSingle();
    const alreadyCharged = !!existing?.registration_fee_charged;
    if (!alreadyCharged) {
      const studentName = input.enrollments.find((e) => e.student_id === sid)?.student_name ?? "Student";
      lines.push({
        student_id: sid,
        student_name: studentName,
        class_id: null,
        category: "registration_fee",
        description: `Registration Fee — ${studentName} (${seasonLabel(seasonYear)})`,
        months: null,
        unit_amount_cents: REGISTRATION_FEE_CENTS,
        amount_cents: REGISTRATION_FEE_CENTS,
        sort_order: sort++,
      });
      // Mark as charged
      await supabaseAdmin
        .from("student_semester_fees")
        .upsert({
          student_id: sid,
          semester_year: seasonYear,
          registration_fee_charged: true,
          registration_fee_paid: false,
          recital_fee_charged: existing?.recital_fee_charged ?? false,
          recital_fee_paid: existing?.recital_fee_paid ?? false,
        }, { onConflict: "student_id,semester_year" });
    }
  }

  // 3. Recital fee — once per student per season (charge if not already)
  for (const sid of uniqStudentIds) {
    const { data: existing } = await supabaseAdmin
      .from("student_semester_fees")
      .select("*")
      .eq("student_id", sid)
      .eq("semester_year", seasonYear)
      .maybeSingle();
    if (!existing?.recital_fee_charged) {
      const studentName = input.enrollments.find((e) => e.student_id === sid)?.student_name ?? "Student";
      lines.push({
        student_id: sid,
        student_name: studentName,
        class_id: null,
        category: "recital_fee",
        description: `Recital Fee — ${studentName}`,
        months: null,
        unit_amount_cents: RECITAL_FEE_CENTS,
        amount_cents: RECITAL_FEE_CENTS,
        sort_order: sort++,
      });
      await supabaseAdmin
        .from("student_semester_fees")
        .upsert({
          student_id: sid,
          semester_year: seasonYear,
          registration_fee_charged: existing?.registration_fee_charged ?? true,
          registration_fee_paid: existing?.registration_fee_paid ?? false,
          recital_fee_charged: true,
          recital_fee_paid: false,
        }, { onConflict: "student_id,semester_year" });
    }
  }

  // 4. Cash discount ($5/class enrolled)
  const subtotal = lines.reduce((s, l) => s + l.amount_cents, 0);
  let discount = 0;
  if (input.cashPayment && input.enrollments.length > 0) {
    discount = CASH_DISCOUNT_PER_CLASS_CENTS * input.enrollments.length;
    lines.push({
      student_id: null,
      student_name: null,
      class_id: null,
      category: "discount",
      description: `Cash Discount — $${(CASH_DISCOUNT_PER_CLASS_CENTS / 100).toFixed(2)} × ${input.enrollments.length} class${input.enrollments.length === 1 ? "" : "es"}`,
      months: null,
      unit_amount_cents: -CASH_DISCOUNT_PER_CLASS_CENTS,
      amount_cents: -discount,
      sort_order: sort++,
    });
  }
  const total = subtotal - discount;

  // 5. Generate invoice number
  const { data: numRes, error: numErr } = await supabaseAdmin.rpc("next_invoice_number");
  if (numErr) throw new Error(`Could not allocate invoice number: ${numErr.message}`);
  const invoiceNumber = numRes as unknown as string;

  // 6. Insert invoice
  const { data: inv, error: invErr } = await supabaseAdmin
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      parent_id: input.parentId,
      parent_email: input.parentEmail,
      parent_name: input.parentName,
      semester_year: seasonYear,
      semester_label: seasonLabel(seasonYear),
      tuition_plan: input.tuitionPlan,
      invoice_preference: input.invoicePreference,
      cash_payment: input.cashPayment,
      subtotal_cents: subtotal,
      discount_cents: discount,
      total_cents: total,
      status: "new",
      due_date: defaultDueDateISO(),
      notes: input.notes ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    } as never)
    .select("id, invoice_number")
    .single();
  if (invErr || !inv) throw new Error(invErr?.message ?? "Could not create invoice");

  // 7. Insert line items
  const lineRows = lines.map((l) => ({ ...l, invoice_id: inv.id }));
  const { error: linesErr } = await supabaseAdmin.from("invoice_line_items").insert(lineRows as never);
  if (linesErr) throw new Error(linesErr.message);

  // 8. Best-effort: generate Stripe link + send invoice email. Never fail
  //    registration if Stripe or email are unavailable — the invoice row
  //    exists and is visible in the parent portal / admin either way.
  let paymentUrl: string | null = null;
  if (total > 0) {
    try {
      const link = await ensureInvoicePaymentLink(inv.id);
      if (!("error" in link)) paymentUrl = link.payment_url;
    } catch (e) {
      console.error("[buildInvoiceForRegistration] Stripe link failed (non-fatal):", e);
    }
  }
  try {
    // Re-read the invoice with its line items to build the email payload.
    const { data: full } = await supabaseAdmin
      .from("invoices")
      .select("*, line_items:invoice_line_items(*)")
      .eq("id", inv.id)
      .single();
    if (full) {
      const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
      await enqueueTransactionalEmail({
        templateName: "invoice-sent",
        recipientEmail: input.parentEmail,
        idempotencyKey: `invoice-sent-${inv.id}`,
        templateData: { ...invoiceEmailPayload(full as unknown as InvoiceWithLines), payment_url: paymentUrl },
      });
      await supabaseAdmin.from("invoices").update({
        emailed_at: new Date().toISOString(),
        status: "sent",
        sent_at: new Date().toISOString(),
      } as never).eq("id", inv.id);
    }
  } catch (e) {
    console.error("[buildInvoiceForRegistration] Email send failed (non-fatal):", e);
  }

  return { invoiceId: inv.id, invoiceNumber: inv.invoice_number };
}

// -----------------------------------------------------------------------------
// Admin: list all invoices with line items
// -----------------------------------------------------------------------------
export type InvoiceWithLines = InvoiceRow & { line_items: InvoiceLineItem[] };

export const listInvoicesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvoiceWithLines[]> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*, line_items:invoice_line_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InvoiceWithLines[];
  });

// Parent-facing: list own invoices
export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvoiceWithLines[]> => {
    const { data: parent } = await context.supabase
      .from("parents").select("id").eq("auth_user_id", context.userId).maybeSingle();
    if (!parent) return [];
    const { data, error } = await context.supabase
      .from("invoices")
      .select("*, line_items:invoice_line_items(*)")
      .eq("parent_id", parent.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InvoiceWithLines[];
  });

export const getInvoiceForParty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<InvoiceWithLines | null> => {
    const { data: row, error } = await context.supabase
      .from("invoices")
      .select("*, line_items:invoice_line_items(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as InvoiceWithLines | null;
  });

// -----------------------------------------------------------------------------
// Admin: update status / notes / amount
// -----------------------------------------------------------------------------
const statusSchema = z.enum(["new", "sent", "paid", "overdue", "cancelled"]);

export const updateInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: statusSchema,
      send_email: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; emailed?: boolean } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { status: data.status, updated_at: new Date().toISOString() };
    if (data.status === "sent") patch.sent_at = new Date().toISOString();
    if (data.status === "paid") patch.paid_at = new Date().toISOString();
    const { data: inv, error } = await supabaseAdmin
      .from("invoices").update(patch as never).eq("id", data.id).select("*, line_items:invoice_line_items(*)").single();
    if (error) return { error: error.message };

    // If setting sent and send_email true, send email
    if (data.status === "sent" && data.send_email !== false) {
      try {
        // Create/refresh a unique payment link for this invoice before sending.
        let paymentUrl: string | null = (inv as any).payment_url ?? null;
        if ((inv as any).total_cents > 0) {
          const link = await ensureInvoicePaymentLink(data.id);
          if (!("error" in link)) paymentUrl = link.payment_url;
        }
        const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
        await enqueueTransactionalEmail({
          templateName: "invoice-sent",
          recipientEmail: (inv as any).parent_email,
          idempotencyKey: `invoice-sent-${data.id}`,
          templateData: { ...invoiceEmailPayload(inv as unknown as InvoiceWithLines), payment_url: paymentUrl },
        });
        await supabaseAdmin.from("invoices").update({ emailed_at: new Date().toISOString() } as never).eq("id", data.id);
        return { ok: true, emailed: true };
      } catch (e) {
        return { ok: true, emailed: false };
      }
    }
    return { ok: true };
  });

export const updateInvoiceAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      total_cents: z.number().int().min(0).optional(),
      subtotal_cents: z.number().int().min(0).optional(),
      discount_cents: z.number().int().min(0).optional(),
      due_date: z.string().optional(),
      admin_notes: z.string().max(2000).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    // If the invoice is being edited (esp. amount), invalidate any live payment link
    // so no outdated link remains active. A fresh link is generated next time it's
    // emailed or the parent visits their portal.
    const amountChanged = patch.total_cents !== undefined || patch.subtotal_cents !== undefined || patch.discount_cents !== undefined;
    if (amountChanged) {
      try { await invalidateInvoicePaymentLink(id); } catch { /* noop */ }
    }
    const { error } = await supabaseAdmin.from("invoices").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", id);
    if (error) return { error: error.message };
    return { ok: true };
  });

export const emailInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("invoices").select("*, line_items:invoice_line_items(*)").eq("id", data.id).single();
    if (error || !inv) return { error: error?.message ?? "Not found" };
    try {
      let paymentUrl: string | null = (inv as any).payment_url ?? null;
      if ((inv as any).total_cents > 0 && (inv as any).status !== "paid" && (inv as any).status !== "cancelled") {
        const link = await ensureInvoicePaymentLink(data.id);
        if (!("error" in link)) paymentUrl = link.payment_url;
      }
      const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
      await enqueueTransactionalEmail({
        templateName: "invoice-sent",
        recipientEmail: (inv as any).parent_email,
        idempotencyKey: `invoice-manual-${data.id}-${Date.now()}`,
        templateData: { ...invoiceEmailPayload(inv as unknown as InvoiceWithLines), payment_url: paymentUrl },
      });
      await supabaseAdmin.from("invoices").update({ emailed_at: new Date().toISOString() } as never).eq("id", data.id);
      return { ok: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Email send failed" };
    }
  });

// Mark student fee statuses (admin only)
export const markFeePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      semester_year: z.number().int(),
      fee: z.enum(["registration", "recital"]),
      paid: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.fee === "registration") patch.registration_fee_paid = data.paid;
    else patch.recital_fee_paid = data.paid;
    const { error } = await supabaseAdmin
      .from("student_semester_fees")
      .update(patch as never)
      .eq("student_id", data.student_id)
      .eq("semester_year", data.semester_year);
    if (error) return { error: error.message };
    return { ok: true };
  });

// -----------------------------------------------------------------------------
// Email payload builder — flatten for React Email template
// -----------------------------------------------------------------------------
function invoiceEmailPayload(inv: InvoiceWithLines) {
  return {
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    parent_name: inv.parent_name,
    semester_label: inv.semester_label,
    tuition_plan: inv.tuition_plan,
    invoice_preference: inv.invoice_preference,
    cash_payment: inv.cash_payment,
    subtotal_cents: inv.subtotal_cents,
    discount_cents: inv.discount_cents,
    total_cents: inv.total_cents,
    line_items: (inv.line_items ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        description: l.description,
        student_name: l.student_name,
        amount_cents: l.amount_cents,
        category: l.category,
      })),
    business: BUSINESS,
  };
}