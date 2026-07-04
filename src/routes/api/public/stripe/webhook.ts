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

          // Idempotency: skip if we've already processed this event id.
          const { data: existing } = await supabaseAdmin
            .from("stripe_webhook_events").select("id").eq("id", event.id).maybeSingle();
          if (existing) return Response.json({ received: true, duplicate: true });
          await supabaseAdmin.from("stripe_webhook_events").insert({
            id: event.id, type: event.type, payload: event as any,
          } as never);

          switch (event.type) {
            case "checkout.session.completed":
            case "checkout.session.async_payment_succeeded": {
              const s = event.data.object;
              const invoiceId = s.metadata?.invoice_id;
              if (!invoiceId) break;
              if (s.payment_status !== "paid") break;
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