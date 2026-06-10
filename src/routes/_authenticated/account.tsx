import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "My Account — Discovery Outpost" }, { name: "robots", content: "noindex" }] }),
  component: AccountPage,
});

type Sub = {
  id: string;
  stripe_subscription_id: string;
  price_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

function priceLabel(id: string) {
  const m: Record<string, string> = {
    tuition_ballet_monthly: "Ballet Tuition — $80/mo",
    tuition_jazz_monthly: "Jazz Tuition — $80/mo",
    tuition_tap_monthly: "Tap Tuition — $80/mo",
    tuition_musical_theatre_monthly: "Musical Theatre Tuition — $80/mo",
  };
  return m[id] ?? id;
}

function AccountPage() {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  async function load() {
    const env = (() => { try { return getStripeEnvironment(); } catch { return "sandbox" as const; } })();
    const { data: u } = await supabase.auth.getUser();
    setEmail(u.user?.email ?? null);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id,stripe_subscription_id,price_id,status,current_period_end,cancel_at_period_end")
      .eq("environment", env)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setSubs((data ?? []) as Sub[]);
  }

  useEffect(() => { void load(); }, []);

  return (
    <Layout>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">My Account</h1>
            {email && <p className="text-sm text-muted-foreground">{email}</p>}
          </div>
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
            Sign out
          </Button>
        </div>

        <h2 className="mt-10 font-display text-xl">My Subscriptions</h2>
        {subs === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : subs.length === 0 ? (
          <Card className="mt-4 p-6">
            <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/tuition">Browse tuition options</Link></Button>
          </Card>
        ) : (
          <div className="mt-4 space-y-3">
            {subs.map((s) => (
              <Card key={s.id} className="p-5">
                <p className="font-medium">{priceLabel(s.price_id)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Status: <span className="font-medium">{s.status}</span>
                  {s.cancel_at_period_end && " • cancels at period end"}
                  {s.current_period_end && ` • renews ${new Date(s.current_period_end).toLocaleDateString()}`}
                </p>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground">
              To cancel or change a subscription, please contact the studio.
            </p>
          </div>
        )}
      </section>
    </Layout>
  );
}