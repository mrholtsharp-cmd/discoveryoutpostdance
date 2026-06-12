import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { createCheckoutSession } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { listTuitionItems } from "@/lib/tuition.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/tuition")({
  head: () => ({
    meta: [
      { title: "Tuition & Enrollment — Discovery Outpost" },
      { name: "description", content: "Pay tuition, registration, and recital fees online. Monthly tuition $80 per discipline." },
    ],
  }),
  component: TuitionPage,
});

type Item = {
  priceId: string;
  name: string;
  price: string;
  description: string;
};

type Plan = "monthly" | "semester";

function TuitionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<Plan>("monthly");
  const [busy, setBusy] = useState<string | null>(null);

  const items = useQuery({ queryKey: ["tuition-items"], queryFn: () => listTuitionItems() });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleBuy(item: Item) {
    if (busy) return;
    setBusy(item.priceId);
    try {
      const result = await createCheckoutSession({
        data: {
          priceId: item.priceId,
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
          ...(user && { userId: user.id, customerEmail: user.email ?? undefined }),
        },
      });
      if ("error" in result) throw new Error(result.error);
      window.location.href = result.url;
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  }

  const all = (items.data ?? []).filter((r) => r.active);
  const monthlyClasses = all.filter((r) => r.kind === "class_monthly");
  const semesterClasses = all.filter((r) => r.kind === "class_semester");
  const oneTime = all.filter((r) => r.kind === "one_time");
  const classesForPlan = plan === "monthly" ? monthlyClasses : semesterClasses;

  return (
    <Layout>
      <PaymentTestModeBanner />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-display text-4xl">Tuition & Enrollment</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Pay tuition and fees online.{" "}
          {!user && (<><Link to="/auth" className="underline text-primary">Sign in or create an account</Link> to check out.</>)}
        </p>

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
            const item: Item = { priceId: r.stripe_price_id, name: `${r.name} Tuition`, price: r.display_price, description: r.description };
            return (
              <Card key={r.id} className="p-6 flex flex-col">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-xl">{item.name}</h3>
                  <span className="text-xl font-semibold">{item.price}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground flex-1">{item.description}</p>
                <Button onClick={() => handleBuy(item)} className="mt-4 rounded-full" disabled={!ready || busy === item.priceId}>
                  {busy === item.priceId ? "Starting checkout…" : plan === "monthly" ? "Enroll & Subscribe" : "Pay Semester"}
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
                const item: Item = { priceId: r.stripe_price_id, name: r.name, price: r.display_price, description: r.description };
                return (
                  <Card key={r.id} className="p-6 flex flex-col">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-lg">{item.name}</h3>
                      <span className="text-lg font-semibold">{item.price}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground flex-1">{item.description}</p>
                    <Button onClick={() => handleBuy(item)} variant="outline" className="mt-4 rounded-full" disabled={!ready || busy === item.priceId}>
                      {busy === item.priceId ? "Starting…" : "Pay"}
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
    </Layout>
  );
}