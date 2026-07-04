import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

/**
 * Admin: refund a paid invoice via Stripe (full or partial).
 * - Requires invoice.stripe_payment_intent_id.
 * - amount_cents omitted => full refund of remaining amount.
 * - Updates invoice status to `refunded` (fully refunded) or `partial_refund`.
 * - Webhook `charge.refunded` also reconciles this (idempotent).
 */
export const refundInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      invoiceId: z.string().uuid(),
      amount_cents: z.number().int().positive().optional(),
      reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]).optional(),
      admin_note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; refund_id: string; amount_cents: number } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStripe, getStripeErrorMessage } = await import("./stripe.server");

    const { data: inv, error } = await supabaseAdmin
      .from("invoices")
      .select("id, status, total_cents, refunded_amount_cents, stripe_payment_intent_id, parent_email, parent_name, invoice_number")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !inv) return { error: error?.message ?? "Invoice not found" };
    const row: any = inv;

    if (row.status !== "paid" && row.status !== "partial_refund") {
      return { error: "Only paid invoices can be refunded" };
    }
    if (!row.stripe_payment_intent_id) {
      return { error: "No Stripe payment on this invoice (paid via cash/other)" };
    }

    const alreadyRefunded = row.refunded_amount_cents ?? 0;
    const remaining = (row.total_cents ?? 0) - alreadyRefunded;
    if (remaining <= 0) return { error: "Invoice fully refunded already" };
    const amount = data.amount_cents ?? remaining;
    if (amount > remaining) return { error: `Amount exceeds remaining refundable ($${(remaining / 100).toFixed(2)})` };

    try {
      const stripe = getStripe();
      const refund = await stripe.refunds.create({
        payment_intent: row.stripe_payment_intent_id,
        amount,
        reason: data.reason,
        metadata: { invoice_id: row.id, invoice_number: row.invoice_number },
      });

      const newRefunded = alreadyRefunded + amount;
      const isFull = newRefunded >= (row.total_cents ?? 0);
      await supabaseAdmin.from("invoices").update({
        status: isFull ? "refunded" : "partial_refund",
        refunded_amount_cents: newRefunded,
        refunded_at: new Date().toISOString(),
        refund_reason: data.admin_note ?? data.reason ?? null,
        updated_at: new Date().toISOString(),
      } as never).eq("id", row.id);

      // Notify parent (best-effort)
      try {
        const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
        await enqueueTransactionalEmail({
          templateName: "refund-issued",
          recipientEmail: row.parent_email,
          idempotencyKey: `refund-${row.id}-${refund.id}`,
          templateData: {
            parent_name: row.parent_name,
            amount_display: `$${(amount / 100).toFixed(2)}`,
            is_full_refund: isFull,
            refunded_at: new Date().toLocaleString(),
          },
        });
      } catch (e) { console.error("[refundInvoice] email failed", e); }

      return { ok: true, refund_id: refund.id, amount_cents: amount };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });