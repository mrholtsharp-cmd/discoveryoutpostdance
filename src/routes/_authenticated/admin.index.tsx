import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listSchedule, upsertScheduleEntry, deleteScheduleEntry } from "@/lib/schedule.functions";
import { getDashboardStats } from "@/lib/admin-dashboard.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Trash2, LogOut, Pencil, Save, X,
  Users, UserCheck, UserPlus, DollarSign, AlertTriangle, Clock,
  CalendarCheck, Hourglass, ListChecks, Repeat,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — Discovery Outpost" }] }),
  component: AdminPage,
});

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sched = useServerFn(listSchedule);
  const stats = useServerFn(getDashboardStats);
  const upsert = useServerFn(upsertScheduleEntry);
  const del = useServerFn(deleteScheduleEntry);

  const schedule = useQuery({ queryKey: ["schedule"], queryFn: () => sched() });
  const dashboard = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => stats() });

  const [day, setDay] = useState("Monday");
  const [className, setClassName] = useState("");
  const [time, setTime] = useState("");
  const [capacity, setCapacity] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ day: string; class_name: string; time: string; sort_order: number; capacity: number | null }>({
    day: "Monday", class_name: "", time: "", sort_order: 0, capacity: null,
  });

  const addM = useMutation({
    mutationFn: () =>
      upsert({ data: { day, class_name: className, time, sort_order: 0, capacity: capacity ? Number(capacity) : null } }),
    onSuccess: () => {
      toast.success("Class added");
      setClassName(""); setTime(""); setCapacity("");
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
  });

  const editM = useMutation({
    mutationFn: (vars: { id: string } & typeof editDraft) =>
      upsert({ data: { id: vars.id, day: vars.day, class_name: vars.class_name, time: vars.time, sort_order: vars.sort_order, capacity: vars.capacity } }),
    onSuccess: () => {
      toast.success("Class updated");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(row: { id: string; day: string; class_name: string; time: string; sort_order: number | null; capacity: number | null }) {
    setEditingId(row.id);
    setEditDraft({ day: row.day, class_name: row.class_name, time: row.time, sort_order: row.sort_order ?? 0, capacity: row.capacity ?? null });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Layout>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.25em] text-primary">Studio Admin</span>
            <h1 className="font-display text-4xl mt-2">Dashboard</h1>
          </div>
          <Button variant="outline" onClick={signOut} className="rounded-full">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>

        <DashboardOverview data={dashboard.data} loading={dashboard.isLoading} />

        <Card className="mt-10 p-6">
          <h2 className="font-display text-2xl">Class Schedule</h2>
          <p className="text-xs text-muted-foreground mt-1">Set a capacity to enable waitlist tracking on the dashboard.</p>
          <div className="mt-4 grid sm:grid-cols-5 gap-3">
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Class name (e.g. Ballet I)" value={className} onChange={(e) => setClassName(e.target.value)} />
            <Input placeholder="Time (e.g. 4:00 - 5:00 PM)" value={time} onChange={(e) => setTime(e.target.value)} />
            <Input type="number" min={0} placeholder="Capacity (optional)" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            <Button onClick={() => addM.mutate()} disabled={!className || !time || addM.isPending}>
              Add Class
            </Button>
          </div>
          <div className="mt-6 divide-y divide-border">
            {schedule.data?.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <div key={row.id} className="py-3 text-sm">
                  {isEditing ? (
                    <div className="grid sm:grid-cols-[1fr_2fr_2fr_1fr_auto] gap-2 items-center">
                      <Select value={editDraft.day} onValueChange={(v) => setEditDraft((d) => ({ ...d, day: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input value={editDraft.class_name} onChange={(e) => setEditDraft((d) => ({ ...d, class_name: e.target.value }))} placeholder="Class name" />
                      <Input value={editDraft.time} onChange={(e) => setEditDraft((d) => ({ ...d, time: e.target.value }))} placeholder="Time" />
                      <Input type="number" min={0} value={editDraft.capacity ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, capacity: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Capacity" />
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => editM.mutate({ id: row.id, ...editDraft })} disabled={editM.isPending}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4 flex-wrap">
                        <span className="w-24 font-medium">{row.day}</span>
                        <span>{row.class_name}</span>
                        <span className="text-muted-foreground">{row.time}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.capacity != null ? `cap ${row.capacity}` : "no cap"}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => startEdit({ ...row, capacity: row.capacity ?? null })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => delM.mutate(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {schedule.data?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No classes yet.</p>
            )}
          </div>
        </Card>

        <Card className="mt-8 p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-display text-2xl">Quick actions</h2>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <Link to="/admin/registrations" className="rounded-lg border border-border p-4 hover:bg-muted/40 transition">
              <div className="font-medium">Manage registrations</div>
              <div className="text-sm text-muted-foreground">Search, approve, waitlist, edit students, refund payments.</div>
            </Link>
            <Link to="/admin/tuition" className="rounded-lg border border-border p-4 hover:bg-muted/40 transition">
              <div className="font-medium">Tuition & fees</div>
              <div className="text-sm text-muted-foreground">Edit pricing cards and sync from Stripe.</div>
            </Link>
          </div>
        </Card>
      </section>
    </Layout>
  );
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function StatCard({ icon: Icon, label, value, hint, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const toneClass =
    tone === "danger" ? "text-red-600" :
    tone === "warn" ? "text-amber-700" :
    tone === "good" ? "text-emerald-700" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`mt-2 font-display text-3xl ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function DashboardOverview({ data, loading }: { data: Awaited<ReturnType<typeof getDashboardStats>> | undefined; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="p-4 h-24 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div>
        <h2 className="font-display text-lg mb-2">Students</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <StatCard icon={Users} label="Total students" value={data.students.total} />
          <StatCard icon={UserCheck} label="Active students" value={data.students.active} tone="good" hint="Approved & not refunded" />
          <StatCard icon={UserPlus} label="New (30 days)" value={data.students.new30d} />
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg mb-2">Payments</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={DollarSign} label="Revenue this month" value={fmtMoney(data.payments.monthRevenueCents)} tone="good" />
          <StatCard icon={AlertTriangle} label="Failed payments" value={data.payments.failedPayments} tone={data.payments.failedPayments > 0 ? "danger" : "default"} />
          <StatCard icon={Clock} label="Outstanding balances" value={data.payments.outstandingCount} tone={data.payments.outstandingCount > 0 ? "warn" : "default"} />
          <StatCard icon={Repeat} label="Active subscriptions" value={data.payments.activeSubscriptions} />
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg mb-2">Registrations</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link to="/admin/registrations" search={{ q: "", cls: "", lvl: "", trial: "all", from: "", to: "", sort: "newest", page: 1, size: 25 } as never}>
            <StatCard icon={Hourglass} label="Pending" value={data.registrations.pending} tone={data.registrations.pending > 0 ? "warn" : "default"} hint="Awaiting review" />
          </Link>
          <StatCard icon={CalendarCheck} label="Approved" value={data.registrations.approved} tone="good" />
          <StatCard icon={ListChecks} label="Waitlisted" value={data.registrations.waitlisted} />
          <StatCard icon={X} label="Declined" value={data.registrations.declined} />
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg mb-2">Class enrollment & capacity</h2>
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
                <tr>
                  <th className="py-2 px-4">Day</th>
                  <th className="py-2 px-4">Class</th>
                  <th className="py-2 px-4">Time</th>
                  <th className="py-2 px-4">Enrolled</th>
                  <th className="py-2 px-4">Capacity</th>
                  <th className="py-2 px-4">Fill</th>
                  <th className="py-2 px-4">Waitlist</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => {
                  const cap = c.capacity;
                  const fillPct = cap && cap > 0 ? Math.min(100, Math.round((c.enrolled / cap) * 100)) : null;
                  const full = cap != null && c.enrolled >= cap;
                  return (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-2 px-4">{c.day}</td>
                      <td className="py-2 px-4 font-medium">{c.class_name}</td>
                      <td className="py-2 px-4 text-muted-foreground">{c.time}</td>
                      <td className="py-2 px-4">{c.enrolled}</td>
                      <td className="py-2 px-4">{cap ?? "—"}</td>
                      <td className="py-2 px-4">
                        {fillPct == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 rounded bg-muted overflow-hidden">
                              <div
                                className={`h-full ${full ? "bg-red-500" : fillPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                                style={{ width: `${fillPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{fillPct}%</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-4">{c.waitlist > 0 ? c.waitlist : ""}</td>
                    </tr>
                  );
                })}
                {data.classes.length === 0 && (
                  <tr><td colSpan={7} className="py-4 px-4 text-muted-foreground text-sm">No classes yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}