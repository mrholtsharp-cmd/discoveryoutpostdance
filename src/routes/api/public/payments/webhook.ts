import { createFileRoute } from '@tanstack/react-router';
import { type StripeEnv, verifyWebhook } from '@/lib/stripe.server';

async function sb() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

async function markInvoicePaid(invoiceId: string, env: StripeEnv, patch: Record<string, any>) {
  await (await sb())
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_environment: env,
      ...patch,
    } as never)
    .eq('id', invoiceId);
}

async function markInvoiceFailed(invoiceId: string, reason: string, env: StripeEnv) {
  await (await sb())
    .from('invoices')
    .update({ payment_failure_reason: reason, stripe_environment: env } as never)
    .eq('id', invoiceId);
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;
  const patch: Record<string, any> = {
    stripe_session_id: session.id,
    paid_via: session.mode === 'subscription' ? 'subscription' : 'card',
  };
  if (session.payment_intent) patch.stripe_payment_intent_id = session.payment_intent;
  if (session.subscription) patch.stripe_subscription_id = session.subscription;
  // One-time payments are paid on checkout complete. Subscriptions wait for the
  // first invoice.paid event, but we still record the ids here.
  if (session.mode === 'payment' && session.payment_status === 'paid') {
    await markInvoicePaid(invoiceId, env, patch);
  } else {
    await (await sb()).from('invoices').update({ ...patch, stripe_environment: env } as never).eq('id', invoiceId);
  }
}

async function handlePaymentIntentSucceeded(pi: any, env: StripeEnv) {
  const invoiceId = pi.metadata?.invoiceId;
  if (!invoiceId) return;
  await markInvoicePaid(invoiceId, env, {
    stripe_payment_intent_id: pi.id,
    paid_via: 'card',
  });
}

async function handlePaymentIntentFailed(pi: any, env: StripeEnv) {
  const invoiceId = pi.metadata?.invoiceId;
  if (!invoiceId) return;
  await markInvoiceFailed(invoiceId, pi.last_payment_error?.message ?? 'Payment failed', env);
}

async function handleInvoicePaid(inv: any, env: StripeEnv) {
  // Subscription renewal — link back via subscription id
  const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
  if (!subId) return;
  await (await sb())
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_via: 'subscription', stripe_environment: env } as never)
    .eq('stripe_subscription_id', subId);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object, env);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object, env);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object, env);
      break;
    default:
      console.log('Unhandled Stripe event:', event.type);
  }
}

export const Route = createFileRoute('/api/public/payments/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get('env');
        if (rawEnv !== 'sandbox' && rawEnv !== 'live') {
          console.error('Webhook received with invalid env:', rawEnv);
          return Response.json({ received: true, ignored: 'invalid env' });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error('Webhook error:', e);
          return new Response('Webhook error', { status: 400 });
        }
      },
    },
  },
});