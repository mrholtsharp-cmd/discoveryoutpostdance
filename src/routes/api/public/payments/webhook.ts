import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, createStripeClient, verifyWebhook } from "@/lib/stripe.server";
import type { Database } from "@/integrations/supabase/types";

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function fmtMoney(amountCents: number | null | undefined, currency = "USD") {
  if (!amountCents && amountCents !== 0) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(amountCents / 100);
}

async function sendEmail(args: {
  templateName: string;
  recipientEmail?: string;
  idempotencyKey: string;
  templateData: Record<string, any>;
}) {
  try {
    const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
    await enqueueTransactionalEmail(args);
  } catch (e) {
    console.error(`[webhook] email enqueue failed (${args.templateName}):`, (e as Error).message);
  }
}

async function upsertSubscription(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata", subscription.id);
    return;
  }
  // If the checkout requested a scheduled cancel (passed via metadata to
  // avoid the unsupported subscription_data.cancel_at param), apply it now.
  const cancelAtTs = Number(subscription.metadata?.cancel_at_ts);
  if (
    Number.isFinite(cancelAtTs)
    && cancelAtTs > 0
    && !subscription.cancel_at
    && subscription.status !== "canceled"
  ) {
    try {
      const stripe = createStripeClient(env);
      await stripe.subscriptions.update(subscription.id, { cancel_at: cancelAtTs });
    } catch (e) {
      console.error("[webhook] failed to schedule cancel_at:", (e as Error).message);
    }
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key
    || item?.price?.metadata?.lovable_external_id
    || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );
}

async function markCanceled(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

/**
 * Find the registration row associated with a Stripe payment.
 * Strategy (in order):
 *   1. session.metadata.registration_id  (set in createCartCheckoutSession)
 *   2. existing stripe_checkout_session_id / payment_intent_id on registration
 *   3. most recent unpaid registration with matching email
 */
async function findRegistration(opts: {
  registrationId?: string | null;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  email?: string | null;
}) {
  const supa = getSupabase();
  if (opts.registrationId) {
    const { data } = await supa.from("registrations").select("*").eq("id", opts.registrationId).maybeSingle();
    if (data) return data;
  }
  if (opts.sessionId) {
    const { data } = await supa.from("registrations").select("*").eq("stripe_checkout_session_id", opts.sessionId).maybeSingle();
    if (data) return data;
  }
  if (opts.paymentIntentId) {
    const { data } = await supa.from("registrations").select("*").eq("stripe_payment_intent_id", opts.paymentIntentId).maybeSingle();
    if (data) return data;
  }
  if (opts.chargeId) {
    const { data } = await supa.from("registrations").select("*").eq("stripe_charge_id", opts.chargeId).maybeSingle();
    if (data) return data;
  }
  if (opts.email) {
    const { data } = await supa
      .from("registrations")
      .select("*")
      .ilike("email", opts.email)
      .neq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const registrationId: string | null = session.metadata?.registration_id ?? null;
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const reg = await findRegistration({
    registrationId,
    sessionId: session.id,
    paymentIntentId: session.payment_intent ?? null,
    email,
  });

  // Retrieve charge / receipt details (best-effort) using the env's gateway client.
  let receiptUrl: string | null = null;
  let chargeId: string | null = null;
  if (session.payment_intent) {
    try {
      const stripe = createStripeClient(env);
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
        expand: ["latest_charge"],
      });
      const charge: any = (pi as any).latest_charge;
      if (charge && typeof charge === "object") {
        chargeId = charge.id;
        receiptUrl = charge.receipt_url ?? null;
      }
    } catch (e) {
      console.error("[webhook] could not retrieve PI for receipt:", (e as Error).message);
    }
  }

  if (reg) {
    await getSupabase()
      .from("registrations")
      .update({
        payment_status: "paid",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent ?? null,
        stripe_charge_id: chargeId,
        amount_paid_cents: session.amount_total ?? null,
        paid_at: new Date().toISOString(),
        payment_failure_flagged: false,
      })
      .eq("id", reg.id);
  }

  // A single Stripe checkout can cover multiple registration rows (one per
  // student/class enrollment created in submitFullRegistration). Mark ALL
  // pending rows for this customer email as paid so the admin dashboard
  // reflects the true payment state, not just the first row matched above.
  if (email) {
    await getSupabase()
      .from("registrations")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        payment_failure_flagged: false,
        stripe_checkout_session_id: session.id,
      })
      .ilike("email", email)
      .in("payment_status", ["pending", "awaiting_card", "past_due"]);
  }

  const recipient = reg?.email ?? email;
  if (recipient) {
    await sendEmail({
      templateName: "payment-confirmation",
      recipientEmail: recipient,
      idempotencyKey: `pay-confirm-${session.id}`,
      templateData: {
        parent_name: reg?.parent_name,
        student_name: reg?.student_name,
        amount_display: fmtMoney(session.amount_total, session.currency),
        class_name: reg?.desired_class,
        receipt_url: receiptUrl,
        paid_at: new Date().toISOString(),
      },
    });
  }
}

async function handleInvoicePaymentFailed(invoice: any, env: StripeEnv) {
  const email = invoice.customer_email ?? null;
  const attemptCount: number = invoice.attempt_count ?? 1;
  const nextAttempt = invoice.next_payment_attempt
    ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : null;
  const failureReason: string | null =
    invoice.last_finalization_error?.message ??
    invoice.last_payment_error?.message ??
    null;

  // Best-effort registration link via customer email (subscriptions don't
  // carry our registration_id in their metadata yet).
  const reg = await findRegistration({ email });
  if (reg) {
    await getSupabase()
      .from("registrations")
      .update({
        payment_failure_flagged: true,
        payment_failure_count: (reg.payment_failure_count ?? 0) + 1,
        last_payment_error: failureReason,
        payment_status: "past_due",
      })
      .eq("id", reg.id);
  }

  const amount = fmtMoney(invoice.amount_due, invoice.currency);

  if (email) {
    await sendEmail({
      templateName: "payment-failed-parent",
      recipientEmail: email,
      idempotencyKey: `pay-failed-parent-${invoice.id}-${attemptCount}`,
      templateData: {
        parent_name: reg?.parent_name,
        student_name: reg?.student_name,
        amount_display: amount,
        attempt_count: attemptCount,
        next_attempt_at: nextAttempt,
        update_url: "https://discoveryoutpost.dance/account",
      },
    });
  }

  await sendEmail({
    templateName: "payment-failed-admin",
    idempotencyKey: `pay-failed-admin-${invoice.id}-${attemptCount}`,
    templateData: {
      parent_name: reg?.parent_name,
      parent_email: email,
      student_name: reg?.student_name,
      amount_display: amount,
      attempt_count: attemptCount,
      failure_reason: failureReason,
      registration_id: reg?.id,
    },
  });
}

async function handleInvoicePaymentSucceeded(invoice: any) {
  const email = invoice.customer_email ?? null;
  if (!email) return;
  const reg = await findRegistration({ email });
  // Clear the failure flag once a subsequent invoice succeeds.
  if (reg && reg.payment_failure_flagged) {
    await getSupabase()
      .from("registrations")
      .update({
        payment_failure_flagged: false,
        last_payment_error: null,
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", reg.id);
  }
  const lineDescription: string | null = invoice.lines?.data?.[0]?.description ?? null;
  await sendEmail({
    templateName: "payment-confirmation",
    recipientEmail: email,
    idempotencyKey: `pay-confirm-invoice-${invoice.id}`,
    templateData: {
      parent_name: reg?.parent_name,
      student_name: reg?.student_name,
      amount_display: fmtMoney(invoice.amount_paid, invoice.currency),
      class_name: reg?.desired_class ?? lineDescription,
      receipt_url: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
      paid_at: new Date().toISOString(),
    },
  });
}

async function handleChargeRefunded(charge: any) {
  const reg = await findRegistration({
    chargeId: charge.id,
    paymentIntentId: charge.payment_intent ?? null,
    email: charge.billing_details?.email ?? null,
  });
  const refundedCents: number = charge.amount_refunded ?? 0;
  const fullRefund: boolean = (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);

  if (reg) {
    await getSupabase()
      .from("registrations")
      .update({
        refunded_amount_cents: refundedCents,
        refunded_at: new Date().toISOString(),
        payment_status: fullRefund ? "refunded" : "partially_refunded",
      })
      .eq("id", reg.id);
  }

  const recipient = reg?.email ?? charge.billing_details?.email ?? null;
  if (recipient) {
    await sendEmail({
      templateName: "refund-issued",
      recipientEmail: recipient,
      idempotencyKey: `refund-${charge.id}`,
      templateData: {
        parent_name: reg?.parent_name,
        student_name: reg?.student_name,
        amount_display: fmtMoney(refundedCents, charge.currency),
        is_full_refund: fullRefund,
        refunded_at: new Date().toISOString(),
      },
    });
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  // Idempotency — drop duplicates Stripe replays.
  const eventId = (event as any).id as string | undefined;
  if (eventId) {
    const { error: dupeErr } = await getSupabase()
      .from("stripe_webhook_events")
      .insert({ event_id: eventId, event_type: event.type, environment: env });
    if (dupeErr) {
      if ((dupeErr as any).code === "23505") {
        console.log("[webhook] duplicate event, skipping:", eventId);
        return;
      }
      console.error("[webhook] event log insert error:", dupeErr.message);
    }
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await markCanceled(event.data.object, env);
      break;
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object, env);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook received with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});