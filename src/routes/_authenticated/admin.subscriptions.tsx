import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { listSubscriptionsAdmin, cancelSubscriptionAdmin } from "@/lib/admin-v2.functions";
import { exportPdfReport } from "@/lib/admin-pdf";
import { toast } from "sonner";
import { Search, XCircle, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — Admin" }] }),
  component: SubsPage,
});

function SubsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSubscriptionsAdmin);
  const cancel = useServerFn(cancelSubscriptionAdmin);
  const subs = useQuery({ queryKey: ["admin-subs"], queryFn: () => list() });

  const [q, setQ] = useState("");
  const [cancelOpen, setCancelOpen] = useState<any | null>(null);
  const [immediate, setImmediate] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rs = subs.data ?? [];
    if (!t) return rs;
    return rs.filter((s: any) =>
      [s.parent?.first_name, s.parent?.last_name, s.parent?.email, s.status, s.price_id, s.stripe_subscription_id]
        .filter(Boolean).join(" ").toLowerCase().includes(t),
    );
  }, [subs.data, q]);

  const cancelM = useMutation({
    mutationFn: async () => {
      if (!cancelOpen) throw new Error("No subscription");
      const res = await cancel({ data: { subscription_id: cancelOpen.id, immediate } });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success(immediate ? "Subscription cancelled" : "Will cancel at period end");
      setCancelOpen(null); setImmediate(false);
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
      qc.invalidateQueries({ queryKey: ["admin-overview-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportPdf() {
    exportPdfReport({
      title: "Subscriptions Report",
      filename: `subscriptions-${new Date().toISOString().slice(0,10)}.pdf`,
      columns: ["Parent","Email","Status","Plan","Next renewal","Env"],
      rows: filtered.map((s: any) => [
        s.parent ? `${s.parent.first_name} ${s.parent.last_name}` : "—",
        s.parent?.email ?? "", s.status,
        s.price_id ?? "",
        s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "",
        s.environment,
      ]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {subs.data?.length ?? 0}</p>
        </div>
        <Button variant="outline" onClick={exportPdf} className="rounded-full"><Download className="h-4 w-4" /> Export PDF</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search subscriptions…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">Parent</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Plan</th>
                <th className="py-2 px-4">Next renewal</th>
                <th className="py-2 px-4">Env</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-b border-border/60">
                  <td className="py-2 px-4">
                    <div className="font-medium">{s.parent ? `${s.parent.first_name} ${s.parent.last_name}` : "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.parent?.email}</div>
                  </td>
                  <td className="py-2 px-4">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${
                      s.status === "active" || s.status === "trialing" ? "bg-emerald-100 text-emerald-700" :
                      s.status === "past_due" ? "bg-red-100 text-red-700" :
                      "bg-muted text-muted-foreground"
                    }`}>{s.status}{s.cancel_at_period_end && " · ending"}</span>
                  </td>
                  <td className="py-2 px-4 text-muted-foreground text-xs">{s.price_id ?? "—"}</td>
                  <td className="py-2 px-4 text-muted-foreground">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-4 text-muted-foreground text-xs">{s.environment}</td>
                  <td className="py-2 px-4 text-right">
                    {(s.status === "active" || s.status === "trialing" || s.status === "past_due") && !s.cancel_at_period_end && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelOpen(s)}>
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-4 px-4 text-muted-foreground text-sm text-center">No subscriptions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!cancelOpen} onOpenChange={(o) => !o && setCancelOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription</DialogTitle>
            <DialogDescription>
              {cancelOpen?.parent && `${cancelOpen.parent.first_name} ${cancelOpen.parent.last_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={!immediate} onChange={() => setImmediate(false)} /> At period end (recommended)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={immediate} onChange={() => setImmediate(true)} /> Cancel immediately
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(null)}>Back</Button>
            <Button disabled={cancelM.isPending} onClick={() => cancelM.mutate()}>Confirm cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}