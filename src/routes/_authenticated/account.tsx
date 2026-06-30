import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { toast } from "sonner";
import {
  createPortalSession,
  listMyPayments,
  createInvoiceRequest,
  type PaymentHistoryItem,
} from "@/utils/payments.functions";
import {
  getMyPortalSnapshot,
  updateMyParent,
  upsertEmergencyContact,
  deleteEmergencyContact,
  upsertStudent,
  joinClass,
  cancelEnrollment,
  leaveWaitlist,
} from "@/lib/parent-portal.functions";
import { listClassesWithAvailability } from "@/lib/registration-v2.functions";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Parent Portal — Discovery Outpost" }, { name: "robots", content: "noindex" }] }),
  component: AccountPage,
});

function fmtMoney(cents: number, currency = "USD") {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type Snapshot = Awaited<ReturnType<typeof getMyPortalSnapshot>>;
type ClassRow = Awaited<ReturnType<typeof listClassesWithAvailability>>[number];

function AccountPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [subs, setSubs] = useState<Array<{ id: string; price_id: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean | null; stripe_subscription_id: string; }> | null>(null);
  const [payments, setPayments] = useState<PaymentHistoryItem[] | null>(null);
  const [tab, setTab] = useState<"overview" | "students" | "billing" | "history" | "profile">("overview");
  const [busy, setBusy] = useState(false);

  const env = useMemo(() => {
    try { return getStripeEnvironment(); } catch { return "sandbox" as const; }
  }, []);

  async function reload() {
    const [s, c, sb, pay] = await Promise.all([
      getMyPortalSnapshot().catch(() => null),
      listClassesWithAvailability().catch(() => [] as ClassRow[]),
      supabase.from("subscriptions").select("id,stripe_subscription_id,price_id,status,current_period_end,cancel_at_period_end")
        .eq("environment", env).order("created_at", { ascending: false }),
      listMyPayments({ data: { environment: env } }).catch(() => ({ items: [] as PaymentHistoryItem[] })),
    ]);
    setSnap(s);
    setClasses(c);
    setSubs((sb.data ?? []) as any);
    setPayments("items" in pay ? pay.items : []);
  }

  useEffect(() => { void reload(); }, []);

  async function openPortal() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await createPortalSession({ data: { environment: env, returnUrl: window.location.href } });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    } finally { setBusy(false); }
  }

  if (!snap) {
    return <Layout><section className="mx-auto max-w-3xl px-4 py-16"><p className="text-sm text-muted-foreground">Loading your portal…</p></section></Layout>;
  }

  const activeSubs = (subs ?? []).filter(s => ["active", "trialing", "past_due"].includes(s.status));
  const nextRenewal = activeSubs
    .map(s => s.current_period_end ? new Date(s.current_period_end).getTime() : null)
    .filter((n): n is number => !!n)
    .sort((a, b) => a - b)[0] ?? null;

  const balanceCents = (snap.invoice_requests ?? [])
    .filter((r: any) => r.status === "pending" || r.status === "sent")
    .reduce((sum: number, r: any) => sum + (r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1), 0);

  const totalEnrollments = snap.students.reduce((n: number, st: any) => n + st.enrollments.filter((e: any) => e.status === "active").length, 0);
  const totalWaitlist = snap.students.reduce((n: number, st: any) => n + st.waitlist.length, 0);

  return (
    <Layout>
      <section className="mx-auto max-w-4xl px-4 py-8 sm:py-12 space-y-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl truncate">
              Welcome{snap.parent ? `, ${snap.parent.first_name}` : ""}
            </h1>
            {snap.email && <p className="text-xs sm:text-sm text-muted-foreground truncate">{snap.email}</p>}
          </div>
          <Button variant="outline" size="sm" className="shrink-0 rounded-full"
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
            Sign out
          </Button>
        </header>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Balance due" value={balanceCents > 0 ? fmtMoney(balanceCents) : "$0"} tone={balanceCents > 0 ? "warn" : "ok"} />
          <StatTile label="Next payment" value={nextRenewal ? fmtDate(new Date(nextRenewal).toISOString())! : "—"} />
          <StatTile label="Active subs" value={String(activeSubs.length)} />
          <StatTile label="Enrollments" value={`${totalEnrollments}${totalWaitlist ? ` +${totalWaitlist}wl` : ""}`} />
        </div>

        {/* Mobile-friendly tabs */}
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {([
            ["overview", "Overview"], ["students", "Students"], ["billing", "Billing"],
            ["history", "History"], ["profile", "Profile"],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${tab === k ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70"}`}>
              {label}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <OverviewTab snap={snap} activeSubs={activeSubs} onAction={reload} />
        )}
        {tab === "students" && (
          <StudentsTab snap={snap} classes={classes ?? []} onChange={reload} />
        )}
        {tab === "billing" && (
          <BillingTab subs={subs ?? []} invoices={snap.invoice_requests} onOpenPortal={openPortal} portalBusy={busy} snap={snap} />
        )}
        {tab === "history" && (
          <HistoryTab payments={payments} />
        )}
        {tab === "profile" && snap.parent && (
          <ProfileTab snap={snap} onChange={reload} />
        )}
      </section>
    </Layout>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <Card className={`p-3 sm:p-4 ${tone === "warn" ? "border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-base sm:text-lg font-semibold truncate">{value}</p>
    </Card>
  );
}

function OverviewTab({ snap, activeSubs, onAction }: { snap: Snapshot; activeSubs: any[]; onAction: () => void }) {
  const allEnrollments = snap.students.flatMap((s: any) => s.enrollments.filter((e: any) => e.status === "active").map((e: any) => ({ student: s, e })));
  const allWaitlist = snap.students.flatMap((s: any) => s.waitlist.map((w: any) => ({ student: s, w })));

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-display text-lg">Quick actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" className="rounded-full"><Link to="/register">Register a student</Link></Button>
          <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/tuition">View tuition</Link></Button>
        </div>
      </Card>

      <div>
        <h2 className="font-display text-lg mb-3">Enrolled classes</h2>
        {allEnrollments.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-muted-foreground">No active enrollments yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {allEnrollments.map(({ student, e }: any) => (
              <Card key={e.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.class_schedule?.class_name ?? "Class"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {student.first_name} · {e.class_schedule?.day} {e.class_schedule?.time}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">Enrolled</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {allWaitlist.length > 0 && (
        <div>
          <h2 className="font-display text-lg mb-3">Waitlist</h2>
          <div className="space-y-2">
            {allWaitlist.map(({ student, w }: any) => (
              <Card key={w.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{w.class_schedule?.class_name ?? "Class"}</p>
                    <p className="text-xs text-muted-foreground truncate">{student.first_name} · position #{w.wait_position}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">Waitlisted</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-lg mb-3">Active subscriptions</h2>
        {activeSubs.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-muted-foreground">No active subscriptions.</p></Card>
        ) : (
          <div className="space-y-2">
            {activeSubs.map(s => (
              <Card key={s.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.price_id}</p>
                    {s.current_period_end && (
                      <p className="text-xs text-muted-foreground">
                        {s.cancel_at_period_end ? "Ends" : "Renews"} {fmtDate(s.current_period_end)}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 capitalize">{s.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentsTab({ snap, classes, onChange }: { snap: Snapshot; classes: ClassRow[]; onChange: () => void }) {
  const [editing, setEditing] = useState<any | null>(null);
  const [joinFor, setJoinFor] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Students</h2>
        <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>Add student</Button>
      </div>

      {snap.students.length === 0 ? (
        <Card className="p-5"><p className="text-sm text-muted-foreground">No students yet. Add one to enroll in classes.</p></Card>
      ) : (
        <div className="space-y-3">
          {snap.students.map((s: any) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.first_name} {s.last_name}</p>
                  <p className="text-xs text-muted-foreground">DOB {fmtDate(s.date_of_birth)}{s.grade ? ` · ${s.grade}` : ""}</p>
                  {s.allergies && <p className="text-xs text-amber-700 mt-1">Allergies: {s.allergies}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)}>Edit</Button>
                  <Button size="sm" onClick={() => setJoinFor(s)}>Join class</Button>
                </div>
              </div>

              {s.enrollments.length > 0 && (
                <div className="space-y-1.5">
                  {s.enrollments.filter((e: any) => e.status === "active").map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <span className="truncate">{e.class_schedule?.class_name} · {e.class_schedule?.day} {e.class_schedule?.time}</span>
                      <Button size="sm" variant="ghost" className="shrink-0 text-destructive"
                        onClick={async () => {
                          if (!confirm("Cancel this enrollment?")) return;
                          const r = await cancelEnrollment({ data: { enrollmentId: e.id } });
                          if ("error" in r) toast.error(r.error); else { toast.success("Enrollment cancelled"); onChange(); }
                        }}>Cancel</Button>
                    </div>
                  ))}
                </div>
              )}
              {s.waitlist.length > 0 && (
                <div className="space-y-1.5">
                  {s.waitlist.map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
                      <span className="truncate">Waitlist · {w.class_schedule?.class_name} (#{w.wait_position})</span>
                      <Button size="sm" variant="ghost" className="shrink-0"
                        onClick={async () => {
                          const r = await leaveWaitlist({ data: { waitlistId: w.id } });
                          if ("error" in r) toast.error(r.error); else { toast.success("Left waitlist"); onChange(); }
                        }}>Leave</Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <StudentDialog open={creating} onClose={() => setCreating(false)} onSaved={onChange} />
      <StudentDialog open={!!editing} student={editing} onClose={() => setEditing(null)} onSaved={onChange} />
      <JoinClassDialog open={!!joinFor} student={joinFor} classes={classes} onClose={() => setJoinFor(null)} onSaved={onChange} />
    </div>
  );
}

function StudentDialog({ open, student, onClose, onSaved }: { open: boolean; student?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (open) setForm(student ? {
      first_name: student.first_name, last_name: student.last_name, date_of_birth: student.date_of_birth,
      grade: student.grade ?? "", allergies: student.allergies ?? "", medical_notes: student.medical_notes ?? "", shirt_size: student.shirt_size ?? "",
    } : { first_name: "", last_name: "", date_of_birth: "", grade: "", allergies: "", medical_notes: "", shirt_size: "" });
  }, [open, student]);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await upsertStudent({ data: { ...form, id: student?.id, grade: form.grade || null, allergies: form.allergies || null, medical_notes: form.medical_notes || null, shirt_size: form.shirt_size || null } });
      if ("error" in r) throw new Error(r.error);
      toast.success(student ? "Student updated" : "Student added");
      onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{student ? "Edit student" : "Add student"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>First name</Label><Input value={form.first_name ?? ""} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last name</Label><Input value={form.last_name ?? ""} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth ?? ""} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Grade</Label><Input value={form.grade ?? ""} onChange={e => setForm({ ...form, grade: e.target.value })} /></div>
            <div><Label>Shirt size</Label><Input value={form.shirt_size ?? ""} onChange={e => setForm({ ...form, shirt_size: e.target.value })} /></div>
          </div>
          <div><Label>Allergies</Label><Input value={form.allergies ?? ""} onChange={e => setForm({ ...form, allergies: e.target.value })} /></div>
          <div><Label>Medical notes</Label><Textarea rows={2} value={form.medical_notes ?? ""} onChange={e => setForm({ ...form, medical_notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinClassDialog({ open, student, classes, onClose, onSaved }: { open: boolean; student: any; classes: ClassRow[]; onClose: () => void; onSaved: () => void }) {
  const [classId, setClassId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setClassId(""); }, [open]);

  const enrolledIds = new Set<string>((student?.enrollments ?? []).filter((e: any) => e.status === "active").map((e: any) => e.class_id));
  const waitedIds = new Set<string>((student?.waitlist ?? []).map((w: any) => w.class_id));
  const available = classes.filter(c => !enrolledIds.has(c.id) && !waitedIds.has(c.id));

  async function go() {
    if (!classId) return;
    setBusy(true);
    try {
      const r = await joinClass({ data: { studentId: student.id, classId } });
      if ("error" in r) throw new Error(r.error);
      if (r.placement === "enrolled") toast.success("Enrolled!");
      else if (r.placement === "waitlisted") toast.success(`Added to waitlist (#${r.position})`);
      else toast(r.placement);
      onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not join"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Join a class — {student?.first_name}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">No more classes available to join.</p>
          ) : available.map(c => (
            <button key={c.id} onClick={() => setClassId(c.id)}
              className={`w-full text-left p-3 rounded-lg border transition ${classId === c.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.class_name}</p>
                  <p className="text-xs text-muted-foreground">{c.day} {c.time}{c.age_group ? ` · ${c.age_group}` : ""}</p>
                </div>
                {c.is_full ? <Badge variant="outline">Full — waitlist</Badge>
                  : c.remaining != null ? <Badge variant="secondary">{c.remaining} left</Badge> : null}
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={busy || !classId}>{busy ? "Joining…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillingTab({ subs, invoices, onOpenPortal, portalBusy, snap }: { subs: any[]; invoices: any[]; onOpenPortal: () => void; portalBusy: boolean; snap: Snapshot; }) {
  const [requesting, setRequesting] = useState(false);
  const upcomingTuition = snap.students.flatMap((s: any) =>
    s.enrollments
      .filter((e: any) => e.status === "active" && e.class_schedule?.monthly_tuition_cents)
      .map((e: any) => ({ student: s, e })),
  );
  const monthlyTotal = upcomingTuition.reduce((sum: number, x: any) => sum + (x.e.class_schedule.monthly_tuition_cents ?? 0), 0);

  async function requestInvoices() {
    if (upcomingTuition.length === 0) { toast.error("No enrolled tuition to invoice"); return; }
    setRequesting(true);
    try {
      const r = await createInvoiceRequest({
        data: {
          items: upcomingTuition.map((x: any) => ({
            classLabel: x.e.class_schedule.class_name,
            monthlyAmountCents: x.e.class_schedule.monthly_tuition_cents,
            studentName: `${x.student.first_name} ${x.student.last_name}`,
          })),
        },
      });
      if ("error" in r) throw new Error(r.error);
      toast.success(`Invoice request submitted (${r.count} item${r.count > 1 ? "s" : ""})`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not submit"); }
    finally { setRequesting(false); }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg">Payment method</h2>
            <p className="text-sm text-muted-foreground mt-1">Update your card, view receipts, or cancel subscriptions in the secure billing portal.</p>
          </div>
          <Button onClick={onOpenPortal} disabled={portalBusy} className="shrink-0 rounded-full">
            {portalBusy ? "Opening…" : "Open portal"}
          </Button>
        </div>
      </Card>

      <div>
        <h2 className="font-display text-lg mb-3">Upcoming tuition</h2>
        {upcomingTuition.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-muted-foreground">No upcoming tuition.</p></Card>
        ) : (
          <div className="space-y-2">
            {upcomingTuition.map(({ student, e }: any) => (
              <Card key={e.id} className="p-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
                <div className="min-w-0">
                  <p className="font-medium truncate">{e.class_schedule.class_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{student.first_name}</p>
                </div>
                <p className="text-sm font-semibold shrink-0">{fmtMoney(e.class_schedule.monthly_tuition_cents)}/mo</p>
              </Card>
            ))}
            <div className="flex items-center justify-between gap-2 px-1 pt-2">
              <p className="text-sm font-semibold">Monthly total</p>
              <p className="text-sm font-semibold">{fmtMoney(monthlyTotal)}</p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={requestInvoices} disabled={requesting}>
              {requesting ? "Submitting…" : "Request invoice instead of auto-pay"}
            </Button>
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display text-lg mb-3">All subscriptions</h2>
        {subs.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-muted-foreground">No subscriptions on file.</p></Card>
        ) : (
          <div className="space-y-2">
            {subs.map(s => (
              <Card key={s.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.price_id}</p>
                    {s.current_period_end && (
                      <p className="text-xs text-muted-foreground">
                        {s.cancel_at_period_end ? "Ends" : "Renews"} {fmtDate(s.current_period_end)}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 capitalize">{s.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {invoices.length > 0 && (
        <div>
          <h2 className="font-display text-lg mb-3">Invoice requests</h2>
          <div className="space-y-2">
            {invoices.map((r: any) => (
              <Card key={r.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.class_label}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.student_name ?? ""} · {fmtMoney(r.monthly_amount_cents)}/mo × {r.months_remaining}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 capitalize">{r.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ payments }: { payments: PaymentHistoryItem[] | null }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg">Payment history</h2>
      {payments === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : payments.length === 0 ? (
        <Card className="p-5"><p className="text-sm text-muted-foreground">No payments yet.</p></Card>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <Card key={p.id} className="p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {fmtMoney(p.amount_cents, p.currency)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground capitalize">{p.status}</span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {fmtDate(p.created_at)} · {p.description ?? (p.kind === "invoice" ? "Invoice" : "Charge")}
                  </p>
                </div>
                {p.receipt_url && (
                  <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full">
                    <a href={p.receipt_url} target="_blank" rel="noopener noreferrer">Receipt</a>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileTab({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const p = snap.parent!;
  const [form, setForm] = useState({
    first_name: p.first_name, last_name: p.last_name, phone: p.phone, address: p.address ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await updateMyParent({ data: { ...form, address: form.address || null } });
      if ("error" in r) throw new Error(r.error);
      toast.success("Profile saved"); onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  const [editEC, setEditEC] = useState<any | null>(null);
  const [creatingEC, setCreatingEC] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-display text-lg">Personal information</h2>
        <form onSubmit={save} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>First name</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Last name</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Email on file: {snap.email}. Contact the studio to change.</p>
          <Button type="submit" disabled={busy} className="rounded-full">{busy ? "Saving…" : "Save profile"}</Button>
        </form>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">Emergency contacts</h2>
          <Button size="sm" className="rounded-full" onClick={() => setCreatingEC(true)}>Add</Button>
        </div>
        {snap.emergency_contacts.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-muted-foreground">No emergency contacts yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {snap.emergency_contacts.map((ec: any) => (
              <Card key={ec.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ec.name} {ec.is_primary && <Badge variant="secondary" className="ml-1">Primary</Badge>}</p>
                    <p className="text-xs text-muted-foreground truncate">{ec.phone}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setEditEC(ec)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={async () => {
                        if (!confirm("Delete this contact?")) return;
                        const r = await deleteEmergencyContact({ data: { id: ec.id } });
                        if ("error" in r) toast.error(r.error); else { toast.success("Deleted"); onChange(); }
                      }}>Delete</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ECDialog open={creatingEC} onClose={() => setCreatingEC(false)} onSaved={onChange} />
      <ECDialog open={!!editEC} ec={editEC} onClose={() => setEditEC(null)} onSaved={onChange} />
    </div>
  );
}

function ECDialog({ open, ec, onClose, onSaved }: { open: boolean; ec?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (open) setForm(ec ? { name: ec.name, phone: ec.phone, is_primary: !!ec.is_primary } : { name: "", phone: "", is_primary: false });
  }, [open, ec]);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await upsertEmergencyContact({ data: { ...form, id: ec?.id } });
      if ("error" in r) throw new Error(r.error);
      toast.success("Saved"); onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{ec ? "Edit contact" : "Add emergency contact"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name ?? ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input type="tel" value={form.phone ?? ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.is_primary} onChange={e => setForm({ ...form, is_primary: e.target.checked })} />
            Primary contact
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}