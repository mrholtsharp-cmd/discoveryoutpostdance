import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { createCartCheckoutSession, createInvoiceRequest } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { listTuitionItems } from "@/lib/tuition.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  getSeasonInfo,
  proratedSemesterCents,
  autoPayScheduleLabels,
  SEASON_TOTAL_MONTHS,
} from "@/lib/season";

export const Route = createFileRoute("/tuition")({
  head: () => ({
    meta: [
      { title: "Tuition & Enrollment — Discovery Outpost" },
      { name: "description", content: "Pay tuition, registration, and recital fees online. Monthly tuition $80 per discipline." },
    ],
  }),
  component: TuitionPage,
});

type Plan = "monthly" | "semester";
type PaymentPlan = "auto_pay" | "semester" | "invoice";
type TuitionRow = {
  id: string;
  kind: string;
  name: string;
  display_price: string;
  description: string;
  stripe_price_id: string;
  active: boolean;
};
type CartEntry = {
  priceId: string;
  name: string;
  display_price: string;
  unitCents: number;
  recurring: boolean;
  quantity: number;
};

function priceToCents(display: string): number {
  const m = display.match(/\$([\d.,]+)/);
  if (!m) return 0;
  return Math.round(parseFloat(m[1].replace(/,/g, "")) * 100);
}
function rowToCart(r: TuitionRow): CartEntry {
  return {
    priceId: r.stripe_price_id,
    name: r.name + (r.kind === "class_monthly" ? " (Monthly)" : r.kind === "class_semester" ? " (Semester)" : ""),
    display_price: r.display_price,
    unitCents: priceToCents(r.display_price),
    recurring: r.kind === "class_monthly",
    quantity: 1,
  };
}

function TuitionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<Plan>("monthly");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("auto_pay");

  const items = useQuery({ queryKey: ["tuition-items"], queryFn: () => listTuitionItems() });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  function addToCart(r: TuitionRow) {
    setCart((prev) => {
      const existing = prev.find((e) => e.priceId === r.stripe_price_id);
      if (existing) {
        return prev.map((e) =>
          e.priceId === r.stripe_price_id ? { ...e, quantity: Math.min(e.quantity + 1, 20) } : e,
        );
      }
      return [...prev, rowToCart(r)];
    });
    toast.success(`Added ${r.name}`);
  }
  function removeFromCart(priceId: string) {
    setCart((prev) => prev.filter((e) => e.priceId !== priceId));
  }
  function setQty(priceId: string, qty: number) {
    setCart((prev) =>
      prev.map((e) => (e.priceId === priceId ? { ...e, quantity: Math.max(1, Math.min(20, qty)) } : e)),
    );
  }

  async function checkout() {
    if (checkoutBusy || cart.length === 0) return;
    if (!user) {
      toast.error("Please sign in or create an account to check out.");
      return;
    }
    setCheckoutBusy(true);
    try {
      if (paymentPlan === "invoice") {
        const result = await createInvoiceRequest({
          data: {
            items: cart.map((e) => ({
              classLabel: e.name,
              monthlyAmountCents: e.unitCents * e.quantity,
            })),
          },
        });
        if ("error" in result) throw new Error(result.error);
        toast.success("Invoice request received — the studio will email your monthly invoice.");
        setCart([]);
        setCheckoutBusy(false);
        return;
      }
      const result = await createCartCheckoutSession({
        data: {
          items: cart.map((e) => ({ priceId: e.priceId, quantity: e.quantity })),
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
          paymentPlan,
          ...(user && { userId: user.id, customerEmail: user.email ?? undefined }),
        },
      });
      if ("error" in result) throw new Error(result.error);
      window.location.href = result.url;
    } catch (e) {
      setCheckoutBusy(false);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  }

  const all = ((items.data ?? []) as TuitionRow[]).filter((r) => r.active);
  const monthlyClasses = all.filter((r) => r.kind === "class_monthly");
  const semesterClasses = all.filter((r) => r.kind === "class_semester");
  const oneTime = all.filter((r) => r.kind === "one_time");
  const classesForPlan = plan === "monthly" ? monthlyClasses : semesterClasses;

  const cartCount = cart.reduce((sum, e) => sum + e.quantity, 0);
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const monthlyItemsTotal = cart.filter((e) => e.recurring).reduce((s, e) => s + e.unitCents * e.quantity, 0);
  const semesterItemsTotal = cart.filter((e) => !e.recurring).reduce((s, e) => s + e.unitCents * e.quantity, 0);
  const season = getSeasonInfo();
  const schedule = autoPayScheduleLabels();
  const proratedSemesterTotal = proratedSemesterCents(semesterItemsTotal, season.monthsRemaining);

  // Allowed plans depend on what's in the cart.
  const canAutoPay = monthlyItemsTotal > 0;
  const canSemester = semesterItemsTotal > 0;
  const allowedPlans: PaymentPlan[] = [
    ...(canAutoPay ? ["auto_pay" as const] : []),
    ...(canSemester ? ["semester" as const] : []),
    "invoice" as const,
  ];
  // Keep paymentPlan valid if cart contents change.
  useEffect(() => {
    if (!allowedPlans.includes(paymentPlan)) {
      setPaymentPlan(allowedPlans[0] ?? "auto_pay");
    }
  }, [allowedPlans.join("|")]);

  // Today vs future-schedule totals for the cart summary.
  let todayCents = 0;
  let scheduleNote = "";
  if (paymentPlan === "auto_pay") {
    todayCents = monthlyItemsTotal; // first monthly charge happens at checkout
    scheduleNote = `Then ${monthlyItemsTotal > 0 ? fmt(monthlyItemsTotal) + "/mo" : ""} on ${schedule.slice(1).join(", ") || "future months — none this season"}`;
  } else if (paymentPlan === "semester") {
    todayCents = proratedSemesterTotal;
    scheduleNote = `One-time payment for ${season.monthsRemaining} month${season.monthsRemaining === 1 ? "" : "s"} of the ${season.seasonYear} season`;
  } else {
    todayCents = 0;
    scheduleNote = `Invoice emailed each month — total ${fmt(monthlyItemsTotal)}/mo for ${season.monthsRemaining} month${season.monthsRemaining === 1 ? "" : "s"}`;
  }

  return (
    <Layout>
      <PaymentTestModeBanner />
      <section className="mx-auto max-w-5xl px-6 py-16 pb-40">
        <h1 className="font-display text-4xl">Tuition & Enrollment</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Add classes to your cart and choose a payment plan at checkout — siblings and multiple disciplines welcome.{" "}
          {!user && (<><Link to="/auth" className="underline text-primary">Sign in or create an account</Link> to check out.</>)}
        </p>

        <Card className="mt-6 p-4 bg-accent/40 border-accent">
          <h3 className="font-display text-lg">Season runs August – November</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Tuition is only charged during the 4-month season (Aug, Sep, Oct, Nov).
            {season.monthsRemaining < SEASON_TOTAL_MONTHS && season.monthsRemaining > 0 && (
              <> Joining mid-season? Semester tuition is automatically prorated to the <span className="font-semibold text-foreground">{season.monthsRemaining} month{season.monthsRemaining === 1 ? "" : "s"} remaining</span> in the {season.seasonYear} season.</>
            )}
          </p>
        </Card>

        <Card className="mt-6 p-4 bg-muted/30 border-dashed">
          <h3 className="font-display text-lg">Save $5 when you pay in cash</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Get a <span className="font-semibold text-foreground">$5 discount</span> off each tuition payment
            when you pay in cash. To pay in cash, head to the{" "}
            <Link to="/register" className="underline text-primary">Register</Link> page and choose
            "Pay at the studio." Bring cash to your next class in a sealed envelope labeled with
            the student's name and what it's for (e.g. "Ballet — November tuition").
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Card payments are processed below.
          </p>
        </Card>

        <div className="mt-12 flex items-center justify-between flex-wrap gap-4">
          <h2 className="font-display text-2xl">Class Tuition</h2>
          <div className="inline-flex rounded-full border border-border p-1 bg-muted/40">
            <button
              type="button"
              onClick={() => setPlan("monthly")}
              className={`px-4 py-1.5 text-sm rounded-full transition ${plan === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setPlan("semester")}
              className={`px-4 py-1.5 text-sm rounded-full transition ${plan === "semester" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Semester (4 mo)
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {plan === "monthly"
            ? "Auto-billed each month for 4 months, then ends automatically. Cancel anytime by contacting the studio."
            : "One-time payment covering a full 4-month semester."}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {classesForPlan.map((r) => {
            const inCart = cart.find((e) => e.priceId === r.stripe_price_id);
            return (
              <Card key={r.id} className="p-6 flex flex-col">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-xl">{r.name}</h3>
                  <span className="text-xl font-semibold">{r.display_price}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground flex-1">{r.description}</p>
                <Button
                  onClick={() => addToCart(r)}
                  className="mt-4 rounded-full"
                  disabled={!ready}
                  variant={inCart ? "secondary" : "default"}
                >
                  {inCart ? `In cart × ${inCart.quantity} — add another` : "Add to cart"}
                </Button>
              </Card>
            );
          })}
          {items.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        </div>

        {oneTime.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-2xl">One-time Fees</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {oneTime.map((r) => {
                const inCart = cart.find((e) => e.priceId === r.stripe_price_id);
                return (
                  <Card key={r.id} className="p-6 flex flex-col">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-lg">{r.name}</h3>
                      <span className="text-lg font-semibold">{r.display_price}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground flex-1">{r.description}</p>
                    <Button
                      onClick={() => addToCart(r)}
                      variant={inCart ? "secondary" : "outline"}
                      className="mt-4 rounded-full"
                      disabled={!ready}
                    >
                      {inCart ? `In cart × ${inCart.quantity} — add another` : "Add to cart"}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        <p className="mt-10 text-xs text-muted-foreground">
          To cancel or change a monthly tuition subscription, please contact the studio.
        </p>
      </section>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur shadow-lg">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0">
                    {cartCount}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {cartOneTimeTotal > 0 && <>{fmt(cartOneTimeTotal)} today</>}
                      {cartOneTimeTotal > 0 && cartRecurringTotal > 0 && " · "}
                      {cartRecurringTotal > 0 && <>{fmt(cartRecurringTotal)}/mo × 4</>}
                    </div>
                    <div className="text-xs text-muted-foreground">Tap to review · {cart.length} item{cart.length === 1 ? "" : "s"}</div>
                  </div>
                </div>
                <Button
                  onClick={(ev) => { ev.preventDefault(); checkout(); }}
                  className="rounded-full shrink-0"
                  disabled={checkoutBusy}
                >
                  {checkoutBusy ? "Starting…" : "Checkout"}
                </Button>
              </summary>
              <div className="mt-3 max-h-72 overflow-y-auto space-y-2">
                {cart.map((e) => (
                  <div key={e.priceId} className="flex items-center gap-2 text-sm border-t border-border pt-2">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.display_price}{e.recurring ? " × 4 months" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setQty(e.priceId, e.quantity - 1)}
                        className="w-7 h-7 rounded-full border border-border text-base leading-none"
                        aria-label="Decrease quantity"
                      >−</button>
                      <span className="w-6 text-center tabular-nums">{e.quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQty(e.priceId, e.quantity + 1)}
                        className="w-7 h-7 rounded-full border border-border text-base leading-none"
                        aria-label="Increase quantity"
                      >+</button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(e.priceId)}
                        className="ml-2 text-xs text-muted-foreground underline"
                      >Remove</button>
                    </div>
                  </div>
                ))}
                {cart.some((e) => e.recurring) && (
                  <p className="text-xs text-muted-foreground pt-2">
                    Monthly items are billed together each month for 4 months, then end automatically.
                  </p>
                )}
              </div>
            </details>
          </div>
        </div>
      )}
    </Layout>
  );
}