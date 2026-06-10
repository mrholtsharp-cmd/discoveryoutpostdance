import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
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
  recurring?: boolean;
};

const ONE_TIME: Item[] = [
  { priceId: "trial_class_onetime", name: "Trial Class", price: "$15", description: "Try a class before enrolling." },
  { priceId: "annual_registration_onetime", name: "Annual Registration", price: "$35", description: "Required once per year, per family (up to 4 students)." },
  { priceId: "recital_fee_onetime", name: "Recital Fee", price: "$75", description: "Annual recital fee, per family (up to 4 students)." },
];

const MONTHLY: Item[] = [
  { priceId: "tuition_ballet_monthly", name: "Ballet Tuition", price: "$80/mo", description: "Monthly tuition for Ballet.", recurring: true },
  { priceId: "tuition_jazz_monthly", name: "Jazz Tuition", price: "$80/mo", description: "Monthly tuition for Jazz.", recurring: true },
  { priceId: "tuition_tap_monthly", name: "Tap Tuition", price: "$80/mo", description: "Monthly tuition for Tap.", recurring: true },
  { priceId: "tuition_musical_theatre_monthly", name: "Musical Theatre Tuition", price: "$80/mo", description: "Monthly tuition for Musical Theatre.", recurring: true },
];

function TuitionPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const { openCheckout, closeCheckout, isOpen, checkoutElement } = useStripeCheckout();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  function handleBuy(item: Item) {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    openCheckout({
      priceId: item.priceId,
      userId: user.id,
      customerEmail: user.email ?? undefined,
    });
  }

  return (
    <Layout>
      <PaymentTestModeBanner />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-display text-4xl">Tuition & Enrollment</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Pay tuition and fees online.{" "}
          {!user && (<><Link to="/auth" className="underline text-primary">Sign in or create an account</Link> to check out.</>)}
        </p>

        <h2 className="mt-12 font-display text-2xl">Monthly Tuition</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {MONTHLY.map((item) => (
            <Card key={item.priceId} className="p-6 flex flex-col">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-xl">{item.name}</h3>
                <span className="text-xl font-semibold">{item.price}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground flex-1">{item.description}</p>
              <Button onClick={() => handleBuy(item)} className="mt-4 rounded-full" disabled={!ready}>
                Enroll & Subscribe
              </Button>
            </Card>
          ))}
        </div>

        <h2 className="mt-12 font-display text-2xl">One-time Fees</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {ONE_TIME.map((item) => (
            <Card key={item.priceId} className="p-6 flex flex-col">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-lg">{item.name}</h3>
                <span className="text-lg font-semibold">{item.price}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground flex-1">{item.description}</p>
              <Button onClick={() => handleBuy(item)} variant="outline" className="mt-4 rounded-full" disabled={!ready}>
                Pay
              </Button>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          To cancel or change a monthly tuition subscription, please contact the studio.
        </p>
      </section>

      <Dialog open={isOpen} onOpenChange={(v) => !v && closeCheckout()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Complete your payment</DialogTitle></DialogHeader>
          {checkoutElement}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}