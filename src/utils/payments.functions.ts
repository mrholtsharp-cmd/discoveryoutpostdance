import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type CancelResult = { ok: true } | { error: string };

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
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!Array.isArray(prices.data)) throw new Error("Price lookup failed");
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
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
      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        payment_method_types: isRecurring
          ? ["card", "link"]
          : ["card", "cashapp", "paypal"],
        ...(customerId && { customer: customerId }),
        ...(!isRecurring && { payment_intent_data: { description: productDescription } }),
        ...(userId && { metadata: { userId } }),
        ...(isRecurring && userId && { subscription_data: { metadata: { userId } } }),
      });

      if (!session.client_secret) throw new Error("Payment form could not be started");
      return { clientSecret: session.client_secret };
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