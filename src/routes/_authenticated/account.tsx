import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { listMyInvoices } from "@/lib/invoices.functions";
import { getMyInvoicePaymentLink } from "@/lib/payments.functions";
import { getMyUnreadMessageCount } from "@/lib/messaging.functions";
import {
  getMyPortalSnapshot,
  updateMyParent,
  upsertEmergencyContact,
  deleteEmergencyContact,
  upsertStudent,
  cancelEnrollment,
  leaveWaitlist,
} from "@/lib/parent-portal.functions";
import { listClassesWithAvailability } from "@/lib/registration-v2.functions";
import { PaymentMethods } from "@/components/site/PaymentMethods";

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
  const [myInvoices, setMyInvoicesTop] = useState<any[] | null>(null);
  const [unreadMsgs, setUnreadMsgs] = useState<number>(0);
  const [tab, setTab] = useState<"overview" | "students" | "invoices" | "profile">("overview");
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function reload() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const [s, c, inv] = await Promise.all([
        getMyPortalSnapshot(),
        listClassesWithAvailability().catch(() => [] as ClassRow[]),
        listMyInvoices().catch(() => [] as any[]),
      ]);
      if (!s) throw new Error("We couldn't load your account. Please try again.");
      setSnap(s);
      setClasses(c);
      setMyInvoicesTop(inv as any[]);
      setLoadState("loaded");
      try { const r = await getMyUnreadMessageCount(); setUnreadMsgs(r?.count ?? 0); } catch {}
    } catch (e: any) {
      console.error("[account] portal load failed:", e);
      setLoadError(e?.message || "Something went wrong loading your account.");
      setLoadState("error");
    }
  }
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (import.meta.env.DEV) toast.message("Account route loading");
  }, []);

  if (loadState === "loading") {
    return <Layout><section className="mx-auto max-w-3xl px-4 py-16"><p className="text-sm text-muted-foreground">Loading your portal…</p></section></Layout>;
  }
  if (loadState === "error" || !snap) {
    return (
      <Layout>
        <section className="mx-auto max-w-3xl px-4 py-16 space-y-4">
          <h1 className="font-display text-2xl">We couldn't load your account</h1>
          <p className="text-sm text-muted-foreground">{loadError ?? "Unknown error."}</p>
          <div className="flex gap-2">
            <Button onClick={() => void reload()}>Try again</Button>
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}>
              Sign out
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            If this keeps happening, contact <a className="underline" href="mailto:info@discoveryoutpost.dance">info@discoveryoutpost.dance</a>.
          </p>
        </section>
      </Layout>
    );
  }

  const invoiceRequests = (snap.invoice_requests ?? []) as any[];
  const realInvoices = (myInvoices ?? []) as any[];
  // Only issued invoices are payable in the portal. Drafts (status "new")
  // are admin-only until "Send Invoice" is clicked, so they are excluded
  // from the parent's balance and unpaid count.
  const balanceCents = realInvoices
    .filter((inv: any) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum: number, inv: any) => sum + (inv.total_cents ?? 0), 0);
  const unpaidInvoiceCount = realInvoices.filter((inv: any) => inv.status === "sent" || inv.status === "overdue").length;
  const paidInvoiceCount = realInvoices.filter((inv: any) => inv.status === "paid").length;

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
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link to="/messages">
                Messages{unreadMsgs > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5 min-w-[18px]">{unreadMsgs}</span>
                )}
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-full"
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
              Sign out
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Balance due" value={balanceCents > 0 ? fmtMoney(balanceCents) : "$0"} tone={balanceCents > 0 ? "warn" : "ok"} />
          <StatTile label="Enrollments" value={`${totalEnrollments}${totalWaitlist ? ` +${totalWaitlist}wl` : ""}`} />
          <StatTile label="Invoices unpaid" value={String(unpaidInvoiceCount)} tone={unpaidInvoiceCount > 0 ? "warn" : undefined} />
          <StatTile label="Invoices paid" value={String(paidInvoiceCount)} tone="ok" />
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {([
            ["overview", "Overview"], ["students", "Students"], ["invoices", "Invoices"], ["profile", "Profile"],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${tab === k ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70"}`}>
              {label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <OverviewTab snap={snap} />}
        {tab === "students" && <StudentsTab snap={snap} classes={classes ?? []} onChange={reload} />}
        {tab === "invoices" && <InvoicesTab snap={snap} onChange={reload} />}
        {tab === "profile" && snap.parent && <ProfileTab snap={snap} onChange={reload} />}
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

function OverviewTab({ snap }: { snap: Snapshot }) {
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
    </div>
  );
}

function InvoicesTab({ snap: _snap, onChange: _onChange }: { snap: Snapshot; onChange: () => void }) {
  const [myInvoices, setMyInvoices] = useState<any[] | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    listMyInvoices().then((r) => setMyInvoices(r as any[])).catch(() => setMyInvoices([]));
  }, []);

  async function payInvoice(inv: any) {
    setPayingId(inv.id);
    try {
      const r: any = await getMyInvoicePaymentLink({ data: { invoiceId: inv.id } });
      if (r?.error) throw new Error(r.error);
      if (r?.payment_url) window.location.href = r.payment_url;
      else throw new Error("No payment link returned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open payment page");
    } finally { setPayingId(null); }
  }

  // Only show invoices the admin has issued. Drafts (status "new") are
  // admin-only and are not payable in the parent portal until the admin
  // clicks "Send Invoice".
  const visible = (myInvoices ?? []).filter(
    (inv: any) => inv.status !== "cancelled" && inv.status !== "new",
  );
  const unpaid = visible.filter((inv: any) => inv.status !== "paid");
  const paid = visible.filter((inv: any) => inv.status === "paid");

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg">Payments</h2>

      {myInvoices === null ? (
        <Card className="p-5"><p className="text-sm text-muted-foreground">Loading…</p></Card>
      ) : visible.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            No invoices yet. When the studio issues an invoice, you'll be able to pay it here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {unpaid.map((inv: any) => {
            const createdAt = inv.stripe_session_created_at ? new Date(inv.stripe_session_created_at) : null;
            const businessExpired = createdAt ? (Date.now() - createdAt.getTime() > 1000 * 60 * 60 * 24 * 30 * 4) : false;
            const hasLink = !!inv.payment_url && !businessExpired;
            const isCash = !!inv.cash_payment;
            const canPay = inv.total_cents > 0 && !businessExpired && !isCash;
            return (
              <Card key={inv.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Amount due</p>
                    <p className="font-display text-3xl mt-1">{fmtMoney(inv.total_cents)}</p>
                    {inv.due_date && (
                      <p className="text-xs text-muted-foreground mt-1">Due {fmtDate(inv.due_date)}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0">Unpaid</Badge>
                </div>
                {isCash ? (
                  <div className="mt-4 rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-sm">
                    <p className="font-medium text-amber-900 dark:text-amber-100">Cash / in-person payment</p>
                    <p className="mt-1 text-muted-foreground">
                      You selected cash payment. Please bring your payment to the studio, or use Venmo,
                      Cash App, or PayPal. Contact the studio for account details.
                    </p>
                  </div>
                ) : canPay && hasLink ? (
                  <Button className="rounded-full mt-4 w-full sm:w-auto" onClick={() => payInvoice(inv)} disabled={payingId === inv.id}>
                    {payingId === inv.id ? "Opening secure checkout…" : "Pay Online"}
                  </Button>
                ) : businessExpired ? (
                  <p className="mt-3 text-sm text-muted-foreground">This payment link has expired. Please contact the studio for a new one.</p>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Payment link being prepared. Please check back shortly or contact the studio.</p>
                )}
                {!isCash && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Also accepted: Cash, Venmo, Cash App, PayPal — contact the studio.
                  </p>
                )}
              </Card>
            );
          })}

          {paid.map((inv: any) => (
            <Card key={inv.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-emerald-700">Paid</p>
                  {inv.paid_at && (
                    <p className="text-xs text-muted-foreground">{new Date(inv.paid_at).toLocaleDateString()}</p>
                  )}
                </div>
                <p className="font-display text-xl">{fmtMoney(inv.total_cents)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentsTab({ snap, classes, onChange }: { snap: Snapshot; classes: ClassRow[]; onChange: () => void }) {
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Students</h2>
        <Button size="sm" className="rounded-full" asChild>
          <Link to="/register">Register a student</Link>
        </Button>
      </div>

      {snap.students.length === 0 ? (
        <Card className="p-5 space-y-2">
          <p className="text-sm text-muted-foreground">No students yet. Complete registration to add a student, choose classes, and receive an invoice.</p>
          <Button size="sm" className="rounded-full" asChild><Link to="/register">Start registration</Link></Button>
        </Card>
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

      <StudentDialog open={!!editing} student={editing} onClose={() => setEditing(null)} onSaved={onChange} />
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