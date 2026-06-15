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
        ...(data.userId && { metadata: { userId: data.userId } }),
        ...(isSubscription && {
          subscription_data: {
            ...(data.userId && { metadata: { userId: data.userId } }),
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