import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { getAdminOverview } from "@/lib/admin-v2.functions";
import {
  Users, UsersRound, FileText, DollarSign, CheckCircle2, Clock,
  CalendarCheck, ListChecks, Repeat, Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — Discovery Outpost" }] }),
  component: AdminPage,
});

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function StatCard({ icon: Icon, label, value, hint, tone, to }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; hint?: string;
  tone?: "default" | "warn" | "danger" | "good"; to?: string;
}) {
  const toneClass =
    tone === "danger" ? "text-red-600" :
    tone === "warn" ? "text-amber-700" :
    tone === "good" ? "text-emerald-700" : "text-foreground";
  const body = (
    <Card className={`p-4 ${to ? "hover:bg-muted/40 transition cursor-pointer h-full" : "h-full"}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`mt-2 font-display text-3xl ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function AdminPage() {
  const overview = useServerFn(getAdminOverview);
  const q = useQuery({ queryKey: ["admin-overview-v2"], queryFn: () => overview() });
  const data = q.data;

  if (q.isLoading || !data) {
    return (
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="p-4 h-24 animate-pulse bg-muted/40" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">At-a-glance metrics across students, classes, and invoices.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={Users} label="Total students" value={data.totalStudents} to="/admin/students" hint={`${data.newStudents30d} new in 30 days`} />
        <StatCard icon={UsersRound} label="Active families" value={data.activeFamilies} to="/admin/parents" hint={`${data.newParents30d} new in 30 days`} />
        <StatCard icon={FileText} label="Pending invoices" value={data.pendingInvoices} tone={data.pendingInvoices > 0 ? "warn" : "default"} to="/admin/invoice-requests" />
        <StatCard icon={Clock} label="Invoices sent" value={data.sentInvoices} to="/admin/invoice-requests" />
        <StatCard icon={CheckCircle2} label="Invoices paid" value={data.paidInvoices} tone="good" to="/admin/invoice-requests" />
        <StatCard icon={DollarSign} label="Outstanding est." value={fmtMoney(data.outstandingCents)} tone={data.outstandingCents > 0 ? "warn" : "default"} to="/admin/invoice-requests" />
        <StatCard icon={CalendarCheck} label="Current enrollment" value={data.totalEnrolled} tone="good" to="/admin/classes" />
        <StatCard icon={ListChecks} label="Waitlists" value={data.totalWaitlisted} tone={data.totalWaitlisted > 0 ? "warn" : "default"} to="/admin/waitlists" />
        <StatCard icon={Repeat} label="Recent registrations" value={data.recentRegistrations.length} to="/admin/registrations" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-lg">Class enrollment &amp; waitlists</h2>
          <Link to="/admin/classes" className="text-xs text-primary hover:underline">Manage classes →</Link>
        </div>
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
              {data.enrollmentByClass.map((c) => {
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
                      {fillPct == null ? <span className="text-muted-foreground">—</span> : (
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 rounded bg-muted overflow-hidden">
                            <div className={`h-full ${full ? "bg-red-500" : fillPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${fillPct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{fillPct}%</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-4">{c.waitlist > 0 ? c.waitlist : ""}</td>
                  </tr>
                );
              })}
              {data.enrollmentByClass.length === 0 && (
                <tr><td colSpan={7} className="py-4 px-4 text-muted-foreground text-sm">No classes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-lg flex items-center gap-2"><Activity className="h-4 w-4" /> Recent registrations</h2>
          <Link to="/admin/registrations" className="text-xs text-primary hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">Student</th>
                <th className="py-2 px-4">Parent</th>
                <th className="py-2 px-4">Class</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRegistrations.map((r: any) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2 px-4 font-medium">{r.student_name}</td>
                  <td className="py-2 px-4">{r.parent_name}</td>
                  <td className="py-2 px-4 text-muted-foreground">{r.desired_class ?? "—"}</td>
                  <td className="py-2 px-4">
                    <span className="text-xs rounded-full px-2 py-0.5 bg-muted">{r.approval_status ?? "pending"}</span>
                  </td>
                  <td className="py-2 px-4 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.recentRegistrations.length === 0 && (
                <tr><td colSpan={5} className="py-4 px-4 text-muted-foreground text-sm">No registrations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}