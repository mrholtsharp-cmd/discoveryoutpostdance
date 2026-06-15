import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";
import { createPortalSession } from "@/utils/payments.functions";
import { listTuitionItems } from "@/lib/tuition.functions";

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
type Reg = {
  id: string;
  student_name: string;
  desired_class: string;
  experience_level: string;
  is_trial: boolean;
  created_at: string;
};

function AccountPage() {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [labels, setLabels] = useState<Record<string, { name: string; price: string }>>({});
  const [email, setEmail] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  async function load() {
    const env = (() => { try { return getStripeEnvironment(); } catch { return "sandbox" as const; } })();
    const { data: u } = await supabase.auth.getUser();
    const userEmail = u.user?.email ?? null;
    setEmail(userEmail);

    const [subRes, itemsRes, regRes] = await Promise.all([
      supabase
      .from("subscriptions")
      .select("id,stripe_subscription_id,price_id,status,current_period_end,cancel_at_period_end")
      .eq("environment", env)
        .order("created_at", { ascending: false }),
      listTuitionItems().catch(() => []),
      userEmail
        ? supabase
            .from("registrations")
            .select("id,student_name,desired_class,experience_level,is_trial,created_at")
            .eq("email", userEmail)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (subRes.error) toast.error(subRes.error.message);
    setSubs((subRes.data ?? []) as Sub[]);
    const map: Record<string, { name: string; price: string }> = {};
    for (const it of itemsRes as Array<{ stripe_price_id: string; name: string; display_price: string }>) {
      map[it.stripe_price_id] = { name: it.name, price: it.display_price };
    }
    setLabels(map);
    setRegs(((regRes as any).data ?? []) as Reg[]);
  }

  useEffect(() => { void load(); }, []);

  async function openPortal() {
    if (portalBusy) return;
    setPortalBusy(true);
    try {
      const env = getStripeEnvironment();
      const result = await createPortalSession({
        data: { environment: env, returnUrl: window.location.href },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    } finally {
      setPortalBusy(false);
    }
  }

  function labelFor(priceId: string) {
    const hit = labels[priceId];
    if (hit) return `${hit.name} — ${hit.price}`;
    return priceId;
  }

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

        <div className="mt-10 flex items-end justify-between gap-3 flex-wrap">
          <h2 className="font-display text-xl">My Tuition</h2>
          {subs && subs.length > 0 && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? "Opening…" : "Manage payment method"}
            </Button>
          )}
        </div>
        {subs === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : subs.length === 0 ? (
          <Card className="mt-4 p-6">
            <p className="text-sm text-muted-foreground">No card-on-file tuition yet.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/tuition">Browse tuition options</Link></Button>
          </Card>
        ) : (
          <div className="mt-4 space-y-3">
            {subs.map((s) => {
              const renews = s.current_period_end ? new Date(s.current_period_end) : null;
              const renewsLabel = renews
                ? renews.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
                : null;
              return (
                <Card key={s.id} className="p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="font-medium">{labelFor(s.price_id)}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{s.status}</span>
                  </div>
                  {renewsLabel && (
                    <p className="mt-2 text-sm">
                      {s.cancel_at_period_end || s.status === "canceled"
                        ? <>Ends <span className="font-medium">{renewsLabel}</span></>
                        : <>Next charge <span className="font-medium">{renewsLabel}</span></>}
                    </p>
                  )}
                </Card>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Use "Manage payment method" to update your card, view receipts, or cancel.
            </p>
          </div>
        )}

        <h2 className="mt-12 font-display text-xl">My Registrations</h2>
        {regs === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : regs.length === 0 ? (
          <Card className="mt-4 p-6">
            <p className="text-sm text-muted-foreground">No registrations on file under {email ?? "this email"}.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/register">Register a student</Link></Button>
          </Card>
        ) : (
          <div className="mt-4 space-y-3">
            {regs.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="font-medium">{r.student_name}</p>
                  {r.is_trial && <span className="text-xs px-2 py-0.5 rounded-full bg-accent">Trial</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.desired_class} · {r.experience_level}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registered {new Date(r.created_at).toLocaleDateString()}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}