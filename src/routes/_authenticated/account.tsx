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
import { createInvoiceRequest } from "@/lib/invoice-requests.functions";
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

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  sent: "Invoice sent",
  paid: "Paid",
  cancelled: "Cancelled",
};

function AccountPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [tab, setTab] = useState<"overview" | "students" | "invoices" | "profile">("overview");

  async function reload() {
    const [s, c] = await Promise.all([
      getMyPortalSnapshot().catch(() => null),
      listClassesWithAvailability().catch(() => [] as ClassRow[]),
    ]);
    setSnap(s);
    setClasses(c);
  }
  useEffect(() => { void reload(); }, []);

  if (!snap) {
    return <Layout><section className="mx-auto max-w-3xl px-4 py-16"><p className="text-sm text-muted-foreground">Loading your portal…</p></section></Layout>;
  }

  const invoices = (snap.invoice_requests ?? []) as any[];
  const balanceCents = invoices
    .filter((r: any) => r.status === "pending" || r.status === "sent")
    .reduce((sum: number, r: any) => sum + ((r.invoiced_amount_cents ?? (r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1))), 0);

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
              <Link to="/messages">Messages</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-full"
              onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
              Sign out
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Est. balance" value={balanceCents > 0 ? fmtMoney(balanceCents) : "$0"} tone={balanceCents > 0 ? "warn" : "ok"} />
          <StatTile label="Enrollments" value={`${totalEnrollments}${totalWaitlist ? ` +${totalWaitlist}wl` : ""}`} />
          <StatTile label="Invoices pending" value={String(invoices.filter((r: any) => r.status === "pending").length)} />
          <StatTile label="Invoices paid" value={String(invoices.filter((r: any) => r.status === "paid").length)} tone="ok" />
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

function InvoicesTab({ snap, onChange }: { snap: Snapshot; onChange: () => void }) {
  const [requesting, setRequesting] = useState(false);
  const invoices = (snap.invoice_requests ?? []) as any[];

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
      toast.success(`Invoice request submitted (${r.count} line${r.count > 1 ? "s" : ""})`);
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not submit"); }
    finally { setRequesting(false); }
  }

  // Group invoice rows by request_group_id
  const groups = new Map<string, any[]>();
  for (const r of invoices) {
    const key = r.request_group_id ?? `single:${r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const grouped = Array.from(groups.values()).sort((a, b) =>
    a[0].created_at < b[0].created_at ? 1 : -1,
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="font-display text-lg">Request an invoice</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ask the studio to send you an invoice for the current month's tuition based on your
          active enrollments.
        </p>
        {upcomingTuition.length > 0 && (
          <div className="mt-3 space-y-2">
            {upcomingTuition.map(({ student, e }: any) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-border/60 py-1.5">
                <span className="truncate">{e.class_schedule.class_name} · {student.first_name}</span>
                <span className="font-medium">{fmtMoney(e.class_schedule.monthly_tuition_cents)}/mo</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 text-sm font-semibold">
              <span>Monthly total</span>
              <span>{fmtMoney(monthlyTotal)}</span>
            </div>
          </div>
        )}
        <Button className="mt-4 rounded-full" onClick={requestInvoices} disabled={requesting || upcomingTuition.length === 0}>
          {requesting ? "Submitting…" : "Request invoice"}
        </Button>
      </Card>

      <div>
        <h2 className="font-display text-lg mb-3">Your invoice requests</h2>
        {grouped.length === 0 ? (
          <Card className="p-5"><p className="text-sm text-muted-foreground">No invoice requests yet.</p></Card>
        ) : (
          <div className="space-y-3">
            {grouped.map((rows) => {
              const status = rows[0].status;
              const invoicedTotal = rows.reduce((s: number, r: any) => s + (r.invoiced_amount_cents ?? 0), 0);
              const estimated = rows.reduce((s: number, r: any) => s + (r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1), 0);
              return (
                <Card key={rows[0].id} className="p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">Request from {fmtDate(rows[0].created_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        {rows.length} line{rows.length === 1 ? "" : "s"} ·
                        {invoicedTotal > 0 ? ` invoiced ${fmtMoney(invoicedTotal)}` : ` estimate ${fmtMoney(estimated)}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">{STATUS_LABEL[status] ?? status}</Badge>
                  </div>
                  <ul className="mt-3 text-sm space-y-1">
                    {rows.map((r: any) => (
                      <li key={r.id} className="flex items-center justify-between">
                        <span className="truncate">
                          {r.class_label}{r.student_name ? ` · ${r.student_name}` : ""}
                        </span>
                        <span className="text-muted-foreground">
                          {r.invoiced_amount_cents != null
                            ? fmtMoney(r.invoiced_amount_cents)
                            : `est. ${fmtMoney((r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1))}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {rows[0].admin_notes && (
                    <p className="mt-2 text-xs text-muted-foreground italic">Note: {rows[0].admin_notes}</p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
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