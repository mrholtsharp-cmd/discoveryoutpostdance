import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from './stripe.server';

type CheckoutResult = { clientSecret: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  opts: { email?: string | null; userId: string; name?: string | null },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(opts.userId)) throw new Error('Invalid userId');
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${opts.userId}'`, limit: 1,
  });
  if (found.data.length) return found.data[0].id;
  if (opts.email) {
    const byEmail = await stripe.customers.list({ email: opts.email, limit: 1 });
    if (byEmail.data.length) {
      const c = byEmail.data[0];
      await stripe.customers.update(c.id, {
        metadata: { ...c.metadata, userId: opts.userId },
        ...(opts.name && !c.name && { name: opts.name }),
      });
      return c.id;
    }
  }
  const created = await stripe.customers.create({
    ...(opts.email && { email: opts.email }),
    ...(opts.name && { name: opts.name }),
    metadata: { userId: opts.userId },
  });
  return created.id;
}

/**
 * One-time Stripe Checkout for an invoice's outstanding balance.
 * Used for Semester Tuition and any other invoice the parent chooses to pay in full.
 */
export const createInvoiceCheckoutSession = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      invoiceId: z.string().uuid(),
      returnUrl: z.string().url(),
      environment: z.enum(['sandbox', 'live']),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;
    const env = data.environment as StripeEnv;

    // Load invoice + verify caller owns it (RLS)
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_cents, status, parent_id, parent_email, parent_name')
      .eq('id', data.invoiceId)
      .maybeSingle();
    if (error || !invoice) return { error: 'Invoice not found' };
    if (invoice.status === 'paid') return { error: 'Invoice is already paid' };
    if ((invoice.total_cents ?? 0) < 50) return { error: 'Invoice total must be at least $0.50' };

    try {
      const stripe = createStripeClient(env);
      const customerId = await resolveOrCreateCustomer(stripe, {
        email: invoice.parent_email,
        userId,
        name: invoice.parent_name,
      });
      // Persist stripe customer on parent for future reuse
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      await supabaseAdmin.from('parents').update({ stripe_customer_id: customerId }).eq('id', invoice.parent_id);

      const session = await stripe.checkout.sessions.create({
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Discovery Outpost Invoice ${invoice.invoice_number}` },
            unit_amount: invoice.total_cents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        ui_mode: 'embedded_page',
        return_url: data.returnUrl,
        customer: customerId,
        payment_intent_data: {
          description: `Discovery Outpost Invoice ${invoice.invoice_number}`,
          metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, userId },
        },
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          userId,
          kind: 'invoice_one_time',
        },
      });

      await supabaseAdmin.from('invoices').update({
        stripe_session_id: session.id,
        stripe_environment: env,
      }).eq('id', invoice.id);

      return { clientSecret: session.client_secret ?? '' };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

/**
 * Monthly subscription for a parent — one $35/month subscription per student.
 * Uses the pre-registered `monthly_tuition_35` price.
 */
export const createMonthlyPlanCheckoutSession = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      invoiceId: z.string().uuid(),
      studentCount: z.number().int().min(1).max(10),
      returnUrl: z.string().url(),
      environment: z.enum(['sandbox', 'live']),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { supabase, userId } = context;
    const env = data.environment as StripeEnv;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, parent_id, parent_email, parent_name, tuition_plan')
      .eq('id', data.invoiceId)
      .maybeSingle();
    if (error || !invoice) return { error: 'Invoice not found' };
    if (invoice.tuition_plan !== 'monthly') return { error: 'Monthly plan is only available for monthly tuition invoices' };

    try {
      const stripe = createStripeClient(env);
      const prices = await stripe.prices.list({ lookup_keys: ['monthly_tuition_35'], limit: 1 });
      if (!prices.data.length) return { error: 'Monthly tuition price is not configured' };

      const customerId = await resolveOrCreateCustomer(stripe, {
        email: invoice.parent_email,
        userId,
        name: invoice.parent_name,
      });
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      await supabaseAdmin.from('parents').update({ stripe_customer_id: customerId }).eq('id', invoice.parent_id);

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: prices.data[0].id, quantity: data.studentCount }],
        mode: 'subscription',
        ui_mode: 'embedded_page',
        return_url: data.returnUrl,
        customer: customerId,
        subscription_data: {
          description: `Discovery Outpost Monthly Tuition — ${data.studentCount} student(s)`,
          metadata: { invoiceId: invoice.id, userId, kind: 'monthly_tuition' },
        },
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          userId,
          kind: 'monthly_subscription',
        },
      });

      await supabaseAdmin.from('invoices').update({
        stripe_session_id: session.id,
        stripe_environment: env,
      }).eq('id', invoice.id);

      return { clientSecret: session.client_secret ?? '' };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });