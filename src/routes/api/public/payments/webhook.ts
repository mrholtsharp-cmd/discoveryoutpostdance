import { createFileRoute } from '@tanstack/react-router';
import { type StripeEnv, verifyWebhook } from '@/lib/stripe.server';
import { enqueueTransactionalEmail } from '@/lib/email/internal-send.server';
import { BUSINESS } from '@/lib/business';

async function sb() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

function formatUsd(cents: number | null | undefined) {
  const n = ((cents ?? 0) / 100);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return ''; }
}

async function fetchInvoiceForEmail(invoiceId: string) {
  const { data } = await (await sb())
    .from('invoices')
    .select('*, line_items:invoice_line_items(*)')
    .eq('id', invoiceId)
    .maybeSingle();
  return data as any;
}

function summarizeInvoice(inv: any) {
  const lines: any[] = inv?.line_items ?? [];
  const tuition = lines.find((l) => l.category === 'tuition' || l.category === 'semester_tuition' || l.category === 'monthly_tuition');
  const studentName = tuition?.student_name ?? lines[0]?.student_name ?? 'your student';
  const className = tuition?.description ?? '';
  return { studentName, className };
}

async function sendPaymentConfirmationEmail(invoiceId: string, receiptUrl?: string | null) {
  const inv = await fetchInvoiceForEmail(invoiceId);
  if (!inv?.parent_email) return;
  const { studentName, className } = summarizeInvoice(inv);
  try {
    await enqueueTransactionalEmail({
      templateName: 'payment-confirmation',
      recipientEmail: inv.parent_email,
      idempotencyKey: `pay-confirm-${invoiceId}-${inv.paid_at ?? Date.now()}`,
      templateData: {
        parent_name: inv.parent_name,
        student_name: studentName,
        class_name: className,
        amount_display: formatUsd(inv.total_cents),
        receipt_url: receiptUrl ?? null,
        paid_at: formatDate(inv.paid_at ?? new Date().toISOString()),
      },
    });
  } catch (e) {
    console.error('payment-confirmation email failed', e);
  }
}

async function sendPaymentFailedEmails(invoiceId: string, reason: string, attempt = 1, nextAttemptAt?: string | null) {
  const inv = await fetchInvoiceForEmail(invoiceId);
  if (!inv) return;
  const { studentName } = summarizeInvoice(inv);
  const amount = formatUsd(inv.total_cents);
  try {
    if (inv.parent_email) {
      await enqueueTransactionalEmail({
        templateName: 'payment-failed-parent',
        recipientEmail: inv.parent_email,
        idempotencyKey: `pay-fail-parent-${invoiceId}-${attempt}`,
        templateData: {
          parent_name: inv.parent_name,
          student_name: studentName,
          amount_display: amount,
          attempt_count: attempt,
          next_attempt_at: nextAttemptAt ? formatDate(nextAttemptAt) : null,
          update_url: 'https://discoveryoutpost.dance/account',
        },
      });
    }
    await enqueueTransactionalEmail({
      templateName: 'payment-failed-admin',
      recipientEmail: BUSINESS.email,
      idempotencyKey: `pay-fail-admin-${invoiceId}-${attempt}`,
      templateData: {
        parent_name: inv.parent_name,
        parent_email: inv.parent_email,
        student_name: studentName,
        amount_display: amount,
        attempt_count: attempt,
        failure_reason: reason,
        registration_id: inv.invoice_number,
      },
    });
  } catch (e) {
    console.error('payment-failed emails failed', e);
  }
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
    await sendPaymentConfirmationEmail(invoiceId, null);
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
  const receiptUrl = pi.charges?.data?.[0]?.receipt_url ?? null;
  await sendPaymentConfirmationEmail(invoiceId, receiptUrl);
}

async function handlePaymentIntentFailed(pi: any, env: StripeEnv) {
  const invoiceId = pi.metadata?.invoiceId;
  if (!invoiceId) return;
  const reason = pi.last_payment_error?.message ?? 'Payment failed';
  await markInvoiceFailed(invoiceId, reason, env);
  await sendPaymentFailedEmails(invoiceId, reason, 1, null);
}

async function handleInvoicePaid(inv: any, env: StripeEnv) {
  // Subscription renewal — link back via subscription id
  const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
  if (!subId) return;
  const { data: updated } = await (await sb())
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_via: 'subscription', stripe_environment: env } as never)
    .eq('stripe_subscription_id', subId)
    .select('id')
    .maybeSingle();
  const receiptUrl = inv.hosted_invoice_url ?? inv.invoice_pdf ?? null;
  if ((updated as any)?.id) {
    await sendPaymentConfirmationEmail((updated as any).id, receiptUrl);
  }
}

async function handleInvoicePaymentFailed(inv: any, _env: StripeEnv) {
  const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
  if (!subId) return;
  const { data: row } = await (await sb())
    .from('invoices')
    .select('id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle();
  if (!(row as any)?.id) return;
  const reason = inv.last_finalization_error?.message ?? inv.charge?.failure_message ?? 'Card declined';
  const attempt = inv.attempt_count ?? 1;
  const nextAttempt = inv.next_payment_attempt
    ? new Date(inv.next_payment_attempt * 1000).toISOString()
    : null;
  await sendPaymentFailedEmails((row as any).id, reason, attempt, nextAttempt);
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
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object, env);
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