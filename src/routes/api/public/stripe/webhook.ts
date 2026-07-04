import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 500 });

        const sig = request.headers.get("stripe-signature");
        const body = await request.text();
        if (!sig) return new Response("Missing signature", { status: 400 });

        let event: any;
        try {
          const { getStripe } = await import("@/lib/stripe.server");
          event = getStripe().webhooks.constructEvent(body, sig, secret);
        } catch (e: any) {
          console.error("[stripe-webhook] signature verification failed:", e?.message);
          return new Response(`Invalid signature: ${e?.message ?? "unknown"}`, { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const env = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live") ? "live" : "test";
          const { data: existing } = await supabaseAdmin
            .from("stripe_webhook_events").select("id").eq("event_id", event.id).maybeSingle();
          if (existing) return Response.json({ received: true, duplicate: true });
          await supabaseAdmin.from("stripe_webhook_events").insert({
            event_id: event.id, event_type: event.type, environment: env, payload: event as any,
          } as never);

          switch (event.type) {
            case "checkout.session.completed":
            case "checkout.session.async_payment_succeeded": {
              const s = event.data.object;
              const invoiceId = s.metadata?.invoice_id;
              if (!invoiceId) break;
              if (s.payment_status !== "paid") break;
              // Amount validation — never mark paid on mismatch.
              const { data: invRow } = await supabaseAdmin
                .from("invoices").select("id, total_cents, status").eq("id", invoiceId).maybeSingle();
              if (!invRow) {
                console.error("[stripe-webhook] invoice_id from Stripe not found:", invoiceId, "event", event.id);
                break;
              }
              if ((invRow as any).status === "paid") {
                console.log("[stripe-webhook] invoice already paid, skipping:", invoiceId);
                break;
              }
              const paid = s.amount_total ?? 0;
              const expected = (invRow as any).total_cents ?? 0;
              if (paid !== expected) {
                console.error("[stripe-webhook] AMOUNT MISMATCH invoice", invoiceId, "expected", expected, "paid", paid, "event", event.id);
                await supabaseAdmin.from("invoices").update({
                  payment_failure_reason: `Amount mismatch: paid ${paid}¢, expected ${expected}¢ (event ${event.id})`,
                  updated_at: new Date().toISOString(),
                } as never).eq("id", invoiceId);
                break;
              }
              await supabaseAdmin.from("invoices").update({
                status: "paid",
                paid_at: new Date().toISOString(),
                paid_via: "stripe",
                stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
                payment_amount_cents: s.amount_total ?? null,
                payment_method: "card",
                updated_at: new Date().toISOString(),
              } as never).eq("id", invoiceId);

              // Queue receipt email
              try {
                const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
                const { data: inv } = await supabaseAdmin
                  .from("invoices").select("*").eq("id", invoiceId).maybeSingle();
                if (inv) {
                  await enqueueTransactionalEmail({
                    templateName: "payment-confirmation",
                    recipientEmail: (inv as any).parent_email,
                    idempotencyKey: `receipt-${invoiceId}-${event.id}`,
                    templateData: {
                      parent_name: (inv as any).parent_name,
                      student_name: "your student(s)",
                      amount_display: `$${((s.amount_total ?? 0) / 100).toFixed(2)}`,
                      receipt_url: null,
                      paid_at: new Date().toLocaleString(),
                    },
                  });
                }
              } catch (e) { console.error("[stripe-webhook] receipt email failed", e); }
              break;
            }
            case "payment_intent.succeeded": {
              const pi = event.data.object;
              const invoiceId = pi.metadata?.invoice_id;
              if (!invoiceId) break;
              const { data: invRow2 } = await supabaseAdmin
                .from("invoices").select("id, total_cents, status").eq("id", invoiceId).maybeSingle();
              if (!invRow2) {
                console.error("[stripe-webhook] PI invoice_id not found:", invoiceId, "event", event.id);
                break;
              }
              if ((invRow2 as any).status === "paid") break;
              const paid2 = pi.amount_received ?? pi.amount ?? 0;
              const expected2 = (invRow2 as any).total_cents ?? 0;
              if (paid2 !== expected2) {
                console.error("[stripe-webhook] PI AMOUNT MISMATCH invoice", invoiceId, "expected", expected2, "paid", paid2, "event", event.id);
                await supabaseAdmin.from("invoices").update({
                  payment_failure_reason: `Amount mismatch: paid ${paid2}¢, expected ${expected2}¢ (event ${event.id})`,
                  updated_at: new Date().toISOString(),
                } as never).eq("id", invoiceId);
                break;
              }
              await supabaseAdmin.from("invoices").update({
                status: "paid",
                paid_at: new Date().toISOString(),
                paid_via: "stripe",
                stripe_payment_intent_id: pi.id,
                payment_amount_cents: pi.amount_received ?? pi.amount ?? null,
                payment_method: "card",
                receipt_url: pi.charges?.data?.[0]?.receipt_url ?? null,
                updated_at: new Date().toISOString(),
              } as never).eq("id", invoiceId);
              break;
            }
            case "payment_intent.payment_failed": {
              const pi = event.data.object;
              const invoiceId = pi.metadata?.invoice_id;
              if (!invoiceId) break;
              await supabaseAdmin.from("invoices").update({
                payment_failure_reason: pi.last_payment_error?.message ?? "Payment failed",
                updated_at: new Date().toISOString(),
              } as never).eq("id", invoiceId);
              break;
            }
            case "checkout.session.expired": {
              const s = event.data.object;
              const invoiceId = s.metadata?.invoice_id;
              if (!invoiceId) break;
              // Only clear if this is still the current session on the invoice.
              await supabaseAdmin.from("invoices").update({
                payment_url: null,
                stripe_session_expires_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as never).eq("id", invoiceId).eq("stripe_session_id", s.id);
              break;
            }
            case "charge.refunded":
            case "refund.updated": {
              // Look up invoice by payment_intent, reconcile refunded_amount_cents/status.
              const obj: any = event.data.object;
              const paymentIntent: string | null =
                typeof obj.payment_intent === "string" ? obj.payment_intent :
                obj.payment_intent?.id ?? obj.charge ?? null;
              if (!paymentIntent) break;
              const { data: invRow3 } = await supabaseAdmin
                .from("invoices").select("id, total_cents, parent_email, parent_name")
                .eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
              if (!invRow3) {
                console.warn("[stripe-webhook] refund for unknown PI:", paymentIntent, "event", event.id);
                break;
              }
              // amount_refunded is the running total on the Charge object.
              const totalRefunded: number =
                typeof obj.amount_refunded === "number" ? obj.amount_refunded :
                typeof obj.amount === "number" ? obj.amount : 0;
              const invoiceTotal = (invRow3 as any).total_cents ?? 0;
              const isFull = totalRefunded >= invoiceTotal && invoiceTotal > 0;
              await supabaseAdmin.from("invoices").update({
                status: isFull ? "refunded" : "partial_refund",
                refunded_amount_cents: totalRefunded,
                refunded_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as never).eq("id", (invRow3 as any).id);

              try {
                const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
                await enqueueTransactionalEmail({
                  templateName: "refund-issued",
                  recipientEmail: (invRow3 as any).parent_email,
                  idempotencyKey: `refund-webhook-${(invRow3 as any).id}-${event.id}`,
                  templateData: {
                    parent_name: (invRow3 as any).parent_name,
                    amount_display: `$${(totalRefunded / 100).toFixed(2)}`,
                    is_full_refund: isFull,
                    refunded_at: new Date().toLocaleString(),
                  },
                });
              } catch (e) { console.error("[stripe-webhook] refund email failed", e); }
              break;
            }
            default:
              // Unhandled — acknowledged & logged.
              break;
          }

          return Response.json({ received: true });
        } catch (e: any) {
          console.error("[stripe-webhook] handler error:", e);
          return new Response(`Handler error: ${e?.message ?? "unknown"}`, { status: 500 });
        }
      },
    },
  },
});