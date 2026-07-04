// Server-only Stripe client (BYOK). Uses STRIPE_SECRET_KEY.
// Never import this from client-reachable module scope; import lazily inside handlers.
import Stripe from "stripe";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key, { apiVersion: "2024-06-20" as unknown as Stripe.StripeConfig["apiVersion"] } as unknown as Stripe.StripeConfig);
  return _stripe;
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; raw?: { message?: string } };
    return e.raw?.message ?? e.message ?? "Stripe request failed";
  }
  return "Stripe request failed";
}

// 4 months, in seconds (used for Checkout Session expires_at)
export const PAYMENT_LINK_TTL_SECONDS = 60 * 60 * 24 * 30 * 4;
// Stripe caps `expires_at` at 24h from creation for Checkout Sessions.
// So the actual live Checkout Session expires in 24h; we also track a
// business-level 4-month expiration in our DB and refuse to re-use / display
// links beyond that window (regenerating a new Session on demand).
export const STRIPE_SESSION_MAX_SECONDS = 60 * 60 * 23; // 23h to stay under Stripe's 24h cap