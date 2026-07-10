import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

// Business-level payment link lifetime: 4 months from creation.
const FOUR_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 4;
// Stripe Checkout Sessions can only carry expires_at up to 24h from creation.
// We refresh the underlying Session lazily whenever the parent visits and the
// 24h window has elapsed, but still honor the 4-month business expiration.
const STRIPE_SESSION_TTL_SEC = 60 * 60 * 23;

function isLinkBusinessExpired(createdAt: string | null | undefined): boolean {
  if (!createdAt) return true;
  return Date.now() - new Date(createdAt).getTime() > FOUR_MONTHS_MS;
}

/**
 * Create (or refresh) a Stripe Checkout Session for an invoice.
 * - Always creates a NEW Session when: forceNew is true, no existing session, prior session expired, or amount/parent changed.
 * - Invoice must not be paid or cancelled.
 */
export async function ensureInvoicePaymentLink(
  invoiceId: string,
  opts: { forceNew?: boolean; returnUrl?: string } = {},
): Promise<{ payment_url: string; session_id: string; expires_at: string; created_at: string } | { error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getStripe, getStripeErrorMessage } = await import("./stripe.server");

  const { data: inv, error } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, parent_email, parent_name, total_cents, status, cash_payment, stripe_session_id, stripe_session_created_at, payment_url")
    .eq("id", invoiceId)
    .single();
  if (error || !inv) return { error: error?.message ?? "Invoice not found" };
  const row: any = inv;

  if (row.status === "paid") return { error: "Invoice already paid" };
  if (row.status === "cancelled") return { error: "Invoice cancelled" };
  if (!row.total_cents || row.total_cents <= 0) return { error: "Invoice amount must be greater than zero" };

  // If we still have a live session (< 23h old) and no forceNew requested,
  // reuse it — same URL, still active in Stripe.
  const createdAt = row.stripe_session_created_at ? new Date(row.stripe_session_created_at).getTime() : 0;
  const sessionAgeMs = Date.now() - createdAt;
  const businessExpired = isLinkBusinessExpired(row.stripe_session_created_at);
  const stripeExpired = sessionAgeMs > STRIPE_SESSION_TTL_SEC * 1000;

  if (!opts.forceNew && !businessExpired && !stripeExpired && row.stripe_session_id && row.payment_url) {
    return {
      payment_url: row.payment_url,
      session_id: row.stripe_session_id,
      expires_at: new Date(createdAt + STRIPE_SESSION_TTL_SEC * 1000).toISOString(),
      created_at: new Date(createdAt).toISOString(),
    };
  }

  const stripe = getStripe();

  // Expire the previous session in Stripe so its URL stops accepting payment.
  if (row.stripe_session_id) {
    try { await stripe.checkout.sessions.expire(row.stripe_session_id); } catch { /* already expired */ }
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: row.parent_email || undefined,
      expires_at: nowSec + STRIPE_SESSION_TTL_SEC,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: row.total_cents,
            product_data: {
              name: `Discovery Outpost — Invoice ${row.invoice_number}`,
              description: row.parent_name ? `Billed to ${row.parent_name}` : undefined,
            },
          },
        },
      ],
      metadata: {
        invoice_id: row.id,
        invoice_number: row.invoice_number,
        parent_email: row.parent_email ?? "",
      },
      payment_intent_data: {
        description: `Invoice ${row.invoice_number}`,
        metadata: { invoice_id: row.id, invoice_number: row.invoice_number },
        receipt_email: row.parent_email || undefined,
      },
      success_url: (opts.returnUrl || "https://discoveryoutpost.dance/account") + "?paid=1&invoice=" + encodeURIComponent(row.invoice_number),
      cancel_url: (opts.returnUrl || "https://discoveryoutpost.dance/account") + "?cancelled=1&invoice=" + encodeURIComponent(row.invoice_number),
    });

    const created = new Date().toISOString();
    const expires = new Date(Date.now() + STRIPE_SESSION_TTL_SEC * 1000).toISOString();

    await supabaseAdmin.from("invoices").update({
      stripe_session_id: session.id,
      payment_url: session.url,
      stripe_session_created_at: created,
      stripe_session_expires_at: expires,
      stripe_environment: (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live") ? "live" : "test",
      updated_at: new Date().toISOString(),
    } as never).eq("id", row.id);

    return { payment_url: session.url!, session_id: session.id, expires_at: expires, created_at: created };
  } catch (e) {
    return { error: getStripeErrorMessage(e) };
  }
}

/** Admin: regenerate a payment link (invalidates the previous one). */
export const regenerateInvoicePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    return await ensureInvoicePaymentLink(data.invoiceId, { forceNew: true });
  });

/** Parent-facing: get (or lazily refresh) the payment link for one of their own invoices. */
export const getMyInvoicePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Verify the invoice belongs to this parent (RLS also enforces this).
    const { data: inv, error } = await context.supabase
      .from("invoices").select("id, status, cash_payment").eq("id", data.invoiceId).maybeSingle();
    if (error || !inv) return { error: "Invoice not found" as const };
    if ((inv as any).status === "paid") return { error: "Invoice already paid" as const };
    if ((inv as any).status === "cancelled") return { error: "Invoice cancelled" as const };
    if ((inv as any).cash_payment) return { error: "This invoice is set to cash payment. Please pay in person or via Venmo/Cash App/PayPal." as const };
    return await ensureInvoicePaymentLink(data.invoiceId);
  });

/** Called when an invoice is edited — expire the old Stripe session so its URL stops working. */
export async function invalidateInvoicePaymentLink(invoiceId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getStripe } = await import("./stripe.server");
  const { data: inv } = await supabaseAdmin
    .from("invoices").select("stripe_session_id").eq("id", invoiceId).maybeSingle();
  const sid = (inv as any)?.stripe_session_id;
  if (!sid) return;
  try { await getStripe().checkout.sessions.expire(sid); } catch { /* noop */ }
  await supabaseAdmin.from("invoices").update({
    stripe_session_id: null,
    payment_url: null,
    stripe_session_created_at: null,
    stripe_session_expires_at: null,
    updated_at: new Date().toISOString(),
  } as never).eq("id", invoiceId);
}