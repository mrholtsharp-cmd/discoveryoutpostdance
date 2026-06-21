import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { getSeasonInfo, proratedSemesterCents, SEASON_TOTAL_MONTHS } from "@/lib/season";

type CheckoutSessionResult = { url: string } | { error: string };
type CancelResult = { ok: true } | { error: string };
type CartItemInput = { priceId: string; quantity: number };
type PaymentPlan = "auto_pay" | "semester" | "invoice";

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    try {
      const found = await stripe.customers.search({
        query: `metadata['userId']:'${options.userId}'`,
        limit: 1,
      });
      if (Array.isArray(found.data) && found.data.length) return found.data[0].id;
    } catch {
      // Continue with the email lookup/create path below so checkout still works.
    }
  }
  if (options.email) {
    try {
      const existing = await stripe.customers.list({ email: options.email, limit: 1 });
      if (Array.isArray(existing.data) && existing.data.length) {
        const customer = existing.data[0];
        if (options.userId && customer.metadata?.userId !== options.userId) {
          await stripe.customers.update(customer.id, {
            metadata: { ...customer.metadata, userId: options.userId },
          });
        }
        return customer.id;
      }
    } catch {
      // If lookup is unavailable, create a customer with the current checkout details.
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: {
    priceId: string;
    customerEmail?: string;
    userId?: string;
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    let step = "start";
    try {
      step = "create stripe client";
      const stripe = createStripeClient(data.environment);
      const userId = data.userId;
      const email = data.customerEmail;

      step = "look up price";
      const stripePrice = data.priceId.startsWith("price_")
        ? await stripe.prices.retrieve(data.priceId)
        : (await stripe.prices.list({ lookup_keys: [data.priceId] })).data[0];
      if (!stripePrice) throw new Error("Price not found");
      const isRecurring = stripePrice.type === "recurring";

      step = "resolve customer";
      const customerId = (email || userId)
        ? await resolveOrCreateCustomer(stripe, { email, userId })
        : undefined;

      let productDescription: string | undefined;
      if (!isRecurring) {
        step = "retrieve product";
        const productId = typeof stripePrice.product === "string"
          ? stripePrice.product
          : stripePrice.product.id;
        const product = await stripe.products.retrieve(productId);
        productDescription = product.name;
      }

      step = "create checkout session";
      // Monthly tuition runs for 4 billing cycles, then auto-cancels.
      // Stripe charges immediately + once per month, so cancel just before
      // the 5th cycle would post.
      let subscriptionCancelAt: number | undefined;
      if (isRecurring) {
        const d = new Date();
        d.setMonth(d.getMonth() + 4);
        d.setDate(d.getDate() - 1);
        subscriptionCancelAt = Math.floor(d.getTime() / 1000);
      }
      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "hosted" as any,
        success_url: data.returnUrl,
        cancel_url: data.returnUrl.split("?")[0].replace(/\/checkout\/return$/, "/tuition"),
        payment_method_types: isRecurring
          ? ["card", "link"]
          : ["card", "cashapp", "paypal"],
        ...(customerId && { customer: customerId }),
        ...(!isRecurring && { payment_intent_data: { description: productDescription } }),
        ...(userId && { metadata: { userId } }),
        ...(isRecurring && {
          subscription_data: {
            ...(userId && { metadata: { userId } }),
            ...(subscriptionCancelAt && { cancel_at: subscriptionCancelAt }),
          },
        }),
      });

      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return { url: session.url };
    } catch (error) {
      console.error(`Stripe checkout failed during ${step}:`, error);
      return { error: `Payment setup failed during ${step}: ${getStripeErrorMessage(error)}` };
    }
  });

export const adminCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; environment: StripeEnv; immediate?: boolean }) => data)
  .handler(async ({ data, context }): Promise<CancelResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return { error: "Forbidden — admin only" };

    try {
      const stripe = createStripeClient(data.environment);
      if (data.immediate) {
        await stripe.subscriptions.cancel(data.subscriptionId);
      } else {
        await stripe.subscriptions.update(data.subscriptionId, { cancel_at_period_end: true });
      }
      await supabaseAdmin
        .from("subscriptions")
        .update({ cancel_at_period_end: !data.immediate, updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", data.subscriptionId);
      return { ok: true };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Open the Stripe-hosted billing portal so parents can update card on file,
// download receipts, and cancel subscriptions themselves.
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<{ url: string } | { error: string }> => {
    try {
      const { data: sub } = await context.supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", context.userId)
        .eq("environment", data.environment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub?.stripe_customer_id) {
        return { error: "No payment method on file yet. Pay tuition by card first to set one up." };
      }
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: data.returnUrl,
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Parent portal: list invoices and one-time charges for the signed-in user's
// Stripe customer, in the current environment. Receipts/invoices link out to
// Stripe-hosted URLs so parents can download PDFs.
export type PaymentHistoryItem = {
  id: string;
  kind: "invoice" | "charge";
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  created_at: string;
  receipt_url: string | null;
};

export const listMyPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<{ items: PaymentHistoryItem[] } | { error: string }> => {
    try {
      const { data: sub } = await context.supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", context.userId)
        .eq("environment", data.environment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fall back to lookup by email if no subscription row exists yet (e.g.
      // parent paid one-time registration but never started a subscription).
      const stripe = createStripeClient(data.environment);
      let customerId = sub?.stripe_customer_id as string | undefined;
      if (!customerId) {
        const { data: userRes } = await context.supabase.auth.getUser();
        const email = userRes.user?.email;
        if (email) {
          const found = await stripe.customers.list({ email, limit: 1 });
          customerId = found.data[0]?.id;
        }
      }
      if (!customerId) return { items: [] };

      const [invoices, charges] = await Promise.all([
        stripe.invoices.list({ customer: customerId, limit: 24 }),
        stripe.charges.list({ customer: customerId, limit: 24 }),
      ]);

      const items: PaymentHistoryItem[] = [];
      for (const inv of invoices.data) {
        items.push({
          id: inv.id ?? `inv_${inv.number ?? Math.random()}`,
          kind: "invoice",
          amount_cents: inv.amount_paid ?? inv.amount_due ?? 0,
          currency: (inv.currency ?? "usd").toUpperCase(),
          status: inv.status ?? "unknown",
          description: inv.lines?.data?.[0]?.description ?? inv.description ?? null,
          created_at: new Date((inv.created ?? 0) * 1000).toISOString(),
          receipt_url: inv.hosted_invoice_url ?? inv.invoice_pdf ?? null,
        });
      }
      // If the customer has invoices, prefer those (subscriptions). Only
      // surface raw charges when there are no invoices — typically one-time
      // registration / cash-equivalent card sales.
      const useCharges = invoices.data.length === 0;
      for (const ch of useCharges ? charges.data : []) {
        items.push({
          id: ch.id,
          kind: "charge",
          amount_cents: ch.amount,
          currency: ch.currency.toUpperCase(),
          status: ch.status,
          description: ch.description ?? null,
          created_at: new Date(ch.created * 1000).toISOString(),
          receipt_url: ch.receipt_url ?? null,
        });
      }
      items.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { items };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Parent portal: update phone on the auth user metadata. Email changes go
// through Supabase's confirmation flow on the client.
export const updateMyContactInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone?: string; parentName?: string }) => {
    if (data.phone && (data.phone.length < 5 || data.phone.length > 30)) {
      throw new Error("Phone must be 5–30 characters");
    }
    if (data.parentName && (data.parentName.length < 1 || data.parentName.length > 100)) {
      throw new Error("Name must be 1–100 characters");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    const meta: Record<string, string> = {};
    if (data.phone !== undefined) meta.phone = data.phone;
    if (data.parentName !== undefined) meta.parent_name = data.parentName;
    const { error } = await context.supabase.auth.updateUser({ data: meta });
    if (error) return { error: error.message };
    return { ok: true };
  });

// Multi-item cart checkout. Resolves every priceId (lookup_key or raw
// price_*) to a Stripe price, then picks subscription vs payment mode:
// - any recurring price -> subscription mode, one-time prices attached as
//   add_invoice_items on the first invoice (cancel_at 4 months out, same
//   as single-item monthly tuition).
// - all one-time -> payment mode with all line_items.
export const createCartCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: {
    items: CartItemInput[];
    customerEmail?: string;
    userId?: string;
    returnUrl: string;
    environment: StripeEnv;
    paymentPlan?: PaymentPlan;
    registrationId?: string;
  }) => {
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("Cart is empty");
    }
    for (const item of data.items) {
      if (!/^[a-zA-Z0-9_-]+$/.test(item.priceId)) throw new Error("Invalid priceId");
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
        throw new Error("Invalid quantity");
      }
    }
    if (data.paymentPlan && !["auto_pay", "semester", "invoice"].includes(data.paymentPlan)) {
      throw new Error("Invalid paymentPlan");
    }
    if (data.registrationId && !/^[a-zA-Z0-9-]{1,64}$/.test(data.registrationId)) {
      throw new Error("Invalid registrationId");
    }
    return data;
  })
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    let step = "start";
    try {
      const stripe = createStripeClient(data.environment);

      step = "look up prices";
      const resolved = await Promise.all(
        data.items.map(async (item) => {
          const price = item.priceId.startsWith("price_")
            ? await stripe.prices.retrieve(item.priceId)
            : (await stripe.prices.list({ lookup_keys: [item.priceId] })).data[0];
          if (!price) throw new Error(`Price not found: ${item.priceId}`);
          return { price, quantity: item.quantity };
        }),
      );

      const recurring = resolved.filter((r) => r.price.type === "recurring");
      const oneTime = resolved.filter((r) => r.price.type !== "recurring");
      // Plan resolution: explicit paymentPlan wins, otherwise default by item shape.
      const plan: PaymentPlan = data.paymentPlan
        ?? (recurring.length > 0 ? "auto_pay" : "semester");
      const isSubscription = plan === "auto_pay" && recurring.length > 0;
      const season = getSeasonInfo();

      step = "resolve customer";
      const customerId = (data.customerEmail || data.userId)
        ? await resolveOrCreateCustomer(stripe, {
            email: data.customerEmail,
            userId: data.userId,
          })
        : undefined;

      step = "create checkout session";
      // Auto-pay subscriptions stop at the end of November of the current
      // season so parents are never charged outside the Aug–Nov window.
      const subscriptionCancelAt = isSubscription
        ? Math.floor(season.seasonEndDate.getTime() / 1000)
        : undefined;

      // Build line items based on the selected plan.
      // - auto_pay   → only recurring items (one charge today + one per remaining month)
      // - semester   → all items as one-time payment, semester items prorated to remaining months
      // - invoice    → falls back to a one-time Stripe checkout for whatever's in the cart
      //                (the "monthly invoice" flow is recorded separately via createInvoiceRequest)
      const buildOneTimeLineItem = async (r: typeof resolved[number]) => {
        const stripePrice = r.price;
        const isClassSemester = stripePrice.lookup_key?.endsWith("_semester") ?? false;
        // Prorate semester-tuition items based on months remaining in the season.
        if (
          plan === "semester"
          && isClassSemester
          && season.monthsRemaining > 0
          && season.monthsRemaining < SEASON_TOTAL_MONTHS
        ) {
          const fullCents = stripePrice.unit_amount ?? 0;
          const proratedCents = proratedSemesterCents(fullCents, season.monthsRemaining);
          const productId = typeof stripePrice.product === "string"
            ? stripePrice.product
            : stripePrice.product.id;
          const product = await stripe.products.retrieve(productId);
          return {
            quantity: r.quantity,
            price_data: {
              currency: stripePrice.currency,
              unit_amount: proratedCents,
              product_data: {
                name: `${product.name} (Prorated — ${season.monthsRemaining} of ${SEASON_TOTAL_MONTHS} months)`,
              },
            },
          };
        }
        return { price: stripePrice.id, quantity: r.quantity };
      };

      const lineItems = isSubscription
        ? recurring.map((r) => ({ price: r.price.id, quantity: r.quantity }))
        : await Promise.all(resolved.map(buildOneTimeLineItem));

      const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: isSubscription ? "subscription" : "payment",
        ui_mode: "hosted" as any,
        success_url: data.returnUrl,
        cancel_url: data.returnUrl.split("?")[0].replace(/\/checkout\/return$/, "/tuition"),
        payment_method_types: isSubscription
          ? ["card", "link"]
          : ["card", "cashapp", "paypal"],
        ...(customerId && { customer: customerId }),
        metadata: {
          ...(data.userId && { userId: data.userId }),
          ...(data.registrationId && { registration_id: data.registrationId }),
        },
        ...(isSubscription && {
          subscription_data: {
            metadata: {
              ...(data.userId && { userId: data.userId }),
              ...(data.registrationId && { registration_id: data.registrationId }),
            },
            ...(subscriptionCancelAt && { cancel_at: subscriptionCancelAt }),
            ...(oneTime.length > 0 && {
              add_invoice_items: oneTime.map((r) => ({
                price: r.price.id,
                quantity: r.quantity,
              })),
            }),
          },
        }),
      });

      if (!session.url) throw new Error("Stripe did not return a checkout URL");
      return { url: session.url };
    } catch (error) {
      console.error(`Stripe cart checkout failed during ${step}:`, error);
      return { error: `Payment setup failed during ${step}: ${getStripeErrorMessage(error)}` };
    }
  });

// "Monthly Invoice" plan — no Stripe charge today, just record the intent so
// the studio can email an invoice for each remaining season month.
export const createInvoiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    items: Array<{ classLabel: string; monthlyAmountCents: number; studentName?: string }>;
  }) => {
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Empty cart");
    for (const it of data.items) {
      if (!it.classLabel) throw new Error("Missing class label");
      if (!Number.isFinite(it.monthlyAmountCents) || it.monthlyAmountCents <= 0) {
        throw new Error("Invalid amount");
      }
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true; count: number } | { error: string }> => {
    const { data: userRes } = await context.supabase.auth.getUser();
    const email = userRes.user?.email;
    if (!email) return { error: "No email on account" };
    const season = getSeasonInfo();
    const rows = data.items.map((it) => ({
      parent_id: context.userId,
      email,
      student_name: it.studentName ?? null,
      class_label: it.classLabel,
      monthly_amount_cents: it.monthlyAmountCents,
      season_year: season.seasonYear,
      months_remaining: season.monthsRemaining,
      status: "pending",
    }));
    const { error } = await context.supabase.from("invoice_requests").insert(rows);
    if (error) return { error: error.message };
    return { ok: true, count: rows.length };
  });

// Admin: issue a refund against an existing charge or payment intent attached
// to a registration. Either fully refunds or accepts an explicit amount.
export const adminRefundRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    registrationId: string;
    amountCents?: number;
    environment: StripeEnv;
    reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  }) => {
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(data.registrationId)) {
      throw new Error("Invalid registrationId");
    }
    if (data.amountCents !== undefined) {
      if (!Number.isInteger(data.amountCents) || data.amountCents < 50 || data.amountCents > 5_000_000) {
        throw new Error("Refund amount must be between $0.50 and $50,000");
      }
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true; refundId: string } | { error: string }> => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return { error: "Forbidden — admin only" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reg } = await supabaseAdmin
      .from("registrations")
      .select("id, stripe_charge_id, stripe_payment_intent_id, amount_paid_cents, refunded_amount_cents")
      .eq("id", data.registrationId)
      .maybeSingle();
    if (!reg) return { error: "Registration not found" };
    if (!reg.stripe_charge_id && !reg.stripe_payment_intent_id) {
      return { error: "No Stripe charge on file for this registration" };
    }

    try {
      const stripe = createStripeClient(data.environment);
      const refund = await stripe.refunds.create({
        ...(reg.stripe_charge_id
          ? { charge: reg.stripe_charge_id }
          : { payment_intent: reg.stripe_payment_intent_id! }),
        ...(data.amountCents !== undefined && { amount: data.amountCents }),
        ...(data.reason && { reason: data.reason }),
      });
      // The charge.refunded webhook will set the final amounts + send email,
      // but write a hint now so admin UI updates immediately.
      await supabaseAdmin
        .from("registrations")
        .update({
          refunded_amount_cents: (reg.refunded_amount_cents ?? 0) + (refund.amount ?? data.amountCents ?? reg.amount_paid_cents ?? 0),
          refunded_at: new Date().toISOString(),
          payment_status: refund.amount && reg.amount_paid_cents && refund.amount < reg.amount_paid_cents
            ? "partially_refunded"
            : "refunded",
        })
        .eq("id", reg.id);
      return { ok: true, refundId: refund.id };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });