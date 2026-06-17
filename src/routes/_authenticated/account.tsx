import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";
import {
  createPortalSession,
  listMyPayments,
  updateMyContactInfo,
  type PaymentHistoryItem,
} from "@/utils/payments.functions";
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
  selected_class_id: string | null;
  payment_status: string;
  payment_choice: string | null;
};
type ScheduleRow = { id: string; day: string; class_name: string; time: string };

function AccountPage() {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [labels, setLabels] = useState<Record<string, { name: string; price: string }>>({});
  const [schedule, setSchedule] = useState<Record<string, ScheduleRow>>({});
  const [email, setEmail] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [payments, setPayments] = useState<PaymentHistoryItem[] | null>(null);
  const [contact, setContact] = useState<{ parentName: string; phone: string }>({ parentName: "", phone: "" });
  const [contactBusy, setContactBusy] = useState(false);

  async function load() {
    const env = (() => { try { return getStripeEnvironment(); } catch { return "sandbox" as const; } })();
    const { data: u } = await supabase.auth.getUser();
    const userEmail = u.user?.email ?? null;
    setEmail(userEmail);
    setContact({
      parentName: (u.user?.user_metadata?.parent_name as string) ?? "",
      phone: (u.user?.user_metadata?.phone as string) ?? "",
    });

    const [subRes, itemsRes, regRes, schedRes, payRes] = await Promise.all([
      supabase
      .from("subscriptions")
      .select("id,stripe_subscription_id,price_id,status,current_period_end,cancel_at_period_end")
      .eq("environment", env)
        .order("created_at", { ascending: false }),
      listTuitionItems().catch(() => []),
      userEmail
        ? supabase
            .from("registrations")
            .select("id,student_name,desired_class,experience_level,is_trial,created_at,selected_class_id,payment_status,payment_choice")
            .eq("email", userEmail)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from("class_schedule").select("id,day,class_name,time"),
      listMyPayments({ data: { environment: env } }).catch(() => ({ items: [] as PaymentHistoryItem[] })),
    ]);
    if (subRes.error) toast.error(subRes.error.message);
    setSubs((subRes.data ?? []) as Sub[]);
    const map: Record<string, { name: string; price: string }> = {};
    for (const it of itemsRes as Array<{ stripe_price_id: string; name: string; display_price: string }>) {
      map[it.stripe_price_id] = { name: it.name, price: it.display_price };
    }
    setLabels(map);
    setRegs(((regRes as any).data ?? []) as Reg[]);
    const sched: Record<string, ScheduleRow> = {};
    for (const row of (schedRes.data ?? []) as ScheduleRow[]) sched[row.id] = row;
    setSchedule(sched);
    setPayments("items" in payRes ? payRes.items : []);
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

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setContactBusy(true);
    try {
      const res = await updateMyContactInfo({ data: contact });
      if ("error" in res) throw new Error(res.error);
      toast.success("Contact info updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setContactBusy(false);
    }
  }

  function labelFor(priceId: string) {
    const hit = labels[priceId];
    if (hit) return `${hit.name} — ${hit.price}`;
    return priceId;
  }

  const outstanding = (regs ?? []).filter(
    (r) => r.payment_status !== "paid" && (r.payment_choice === "card" || r.payment_choice === "invoice"),
  );
  const upcoming = (regs ?? [])
    .map((r) => ({ reg: r, slot: r.selected_class_id ? schedule[r.selected_class_id] : undefined }))
    .filter((x) => x.slot);

  return (
    <Layout>
      <section className="mx-auto max-w-3xl px-6 py-16 space-y-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">My Account</h1>
            {email && <p className="text-sm text-muted-foreground">{email}</p>}
          </div>
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
            Sign out
          </Button>
        </div>

        {outstanding.length > 0 && (
          <div>
            <h2 className="font-display text-xl">Outstanding balances</h2>
            <div className="mt-4 space-y-3">
              {outstanding.map((r) => (
                <Card key={r.id} className="p-5 border-amber-300/60">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{r.student_name} — {r.desired_class}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.payment_choice === "invoice" ? "Awaiting invoice" : "Payment pending"}
                      </p>
                    </div>
                    <Button asChild size="sm" className="rounded-full">
                      <Link to="/tuition">Pay now</Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="font-display text-xl">My Tuition</h2>
          {subs && subs.length > 0 && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={openPortal} disabled={portalBusy}>
              {portalBusy ? "Opening…" : "Manage payment method"}
            </Button>
          )}
        </div>
        {subs === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : subs.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">No card-on-file tuition yet.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/tuition">Browse tuition options</Link></Button>
          </Card>
        ) : (
          <div className="space-y-3">
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

        <div>
          <h2 className="font-display text-xl">Upcoming classes</h2>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No scheduled class times yet. They'll appear here after enrollment.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {upcoming.map(({ reg, slot }) => (
                <Card key={reg.id} className="p-5">
                  <p className="font-medium">{reg.student_name}</p>
                  <p className="text-sm mt-1">{slot!.class_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{slot!.day} · {slot!.time}</p>
                </Card>
              ))}
            </div>
          )}
        </div>

        <h2 className="font-display text-xl">My Registrations</h2>
        {regs === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : regs.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">No registrations on file under {email ?? "this email"}.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/register">Register a student</Link></Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {regs.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="font-medium">{r.student_name}</p>
                  <div className="flex gap-2">
                    {r.is_trial && <span className="text-xs px-2 py-0.5 rounded-full bg-accent">Trial</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{r.payment_status}</span>
                  </div>
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

        <div>
          <h2 className="font-display text-xl">Payment history</h2>
          {payments === null ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : payments.length === 0 ? (
            <Card className="mt-4 p-6">
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            </Card>
          ) : (
            <div className="mt-4 space-y-2">
              {payments.map((p) => (
                <Card key={p.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">
                      {(p.amount_cents / 100).toLocaleString(undefined, { style: "currency", currency: p.currency })}
                      <span className="ml-2 text-xs text-muted-foreground">{p.status}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(p.created_at).toLocaleDateString()} · {p.description ?? (p.kind === "invoice" ? "Invoice" : "Charge")}
                    </p>
                  </div>
                  {p.receipt_url && (
                    <Button asChild size="sm" variant="outline" className="rounded-full">
                      <a href={p.receipt_url} target="_blank" rel="noopener noreferrer">Receipt</a>
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-xl">Contact info</h2>
          <form onSubmit={saveContact} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="parentName">Parent name</Label>
              <Input
                id="parentName"
                value={contact.parentName}
                onChange={(e) => setContact({ ...contact, parentName: e.target.value })}
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                maxLength={30}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Email on file: <span className="font-medium">{email}</span>. To change your email, sign out and contact the studio.
            </p>
            <Button type="submit" className="rounded-full" disabled={contactBusy}>
              {contactBusy ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </div>
      </section>
    </Layout>
  );
}