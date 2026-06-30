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
import { listPaymentsAdmin, issueRefund } from "@/lib/admin-v2.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { exportPdfReport } from "@/lib/admin-pdf";
import { toast } from "sonner";
import { Search, RotateCcw, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Admin" }] }),
  component: PaymentsPage,
});

function fmt(cents?: number | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function PaymentsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPaymentsAdmin);
  const refund = useServerFn(issueRefund);
  const rows = useQuery({ queryKey: ["admin-payments"], queryFn: () => list() });

  const [q, setQ] = useState("");
  const [refundOpen, setRefundOpen] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundReason, setRefundReason] = useState("");
  const [refundFull, setRefundFull] = useState(true);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rs = rows.data ?? [];
    if (!t) return rs;
    return rs.filter((r: any) =>
      [r.parent_name, r.student_name, r.email, r.desired_class, r.payment_status, r.stripe_payment_intent_id]
        .filter(Boolean).join(" ").toLowerCase().includes(t),
    );
  }, [rows.data, q]);

  const refundM = useMutation({
    mutationFn: async () => {
      if (!refundOpen) throw new Error("No payment");
      const cents = refundFull ? null : Math.round(Number(refundAmount) * 100);
      const res = await refund({ data: {
        registration_id: refundOpen.id,
        amount_cents: cents,
        environment: getStripeEnvironment() as "sandbox" | "live",
        reason: refundReason || undefined,
      }});
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Refund issued");
      setRefundOpen(null); setRefundAmount(""); setRefundReason(""); setRefundFull(true);
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      qc.invalidateQueries({ queryKey: ["admin-overview-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportPdf() {
    exportPdfReport({
      title: "Payments Report",
      filename: `payments-${new Date().toISOString().slice(0,10)}.pdf`,
      columns: ["Date","Parent","Student","Class","Status","Paid","Refunded"],
      rows: filtered.map((r: any) => [
        r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—",
        r.parent_name, r.student_name, r.desired_class ?? "",
        r.payment_status ?? "", fmt(r.amount_paid_cents),
        r.refunded_amount_cents ? fmt(r.refunded_amount_cents) : "",
      ]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Payments</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {rows.data?.length ?? 0}</p>
        </div>
        <Button variant="outline" onClick={exportPdf} className="rounded-full"><Download className="h-4 w-4" /> Export PDF</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search payments…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-4">Parent / Student</th>
                <th className="py-2 px-4">Class</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Paid</th>
                <th className="py-2 px-4">Refunded</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2 px-4 text-muted-foreground">{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-4">
                    <div className="font-medium">{r.parent_name}</div>
                    <div className="text-xs text-muted-foreground">{r.student_name} · {r.email}</div>
                  </td>
                  <td className="py-2 px-4 text-muted-foreground">{r.desired_class ?? "—"}</td>
                  <td className="py-2 px-4">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${
                      r.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" :
                      r.payment_status === "refunded" ? "bg-muted text-muted-foreground" :
                      r.payment_failure_flagged ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>{r.payment_status ?? "pending"}</span>
                  </td>
                  <td className="py-2 px-4">{fmt(r.amount_paid_cents)}</td>
                  <td className="py-2 px-4">{r.refunded_amount_cents ? fmt(r.refunded_amount_cents) : ""}</td>
                  <td className="py-2 px-4 text-right">
                    {(r.stripe_payment_intent_id || r.stripe_charge_id) && r.payment_status !== "refunded" && (
                      <Button size="sm" variant="ghost" onClick={() => { setRefundOpen(r); setRefundFull(true); setRefundAmount(((r.amount_paid_cents ?? 0) / 100).toFixed(2)); }}>
                        <RotateCcw className="h-3.5 w-3.5" /> Refund
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-4 px-4 text-muted-foreground text-sm text-center">No payments.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!refundOpen} onOpenChange={(o) => !o && setRefundOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
            <DialogDescription>
              {refundOpen && (<>Original: {fmt(refundOpen.amount_paid_cents)} · {refundOpen.parent_name}</>)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={refundFull} onChange={() => setRefundFull(true)} /> Full refund
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={!refundFull} onChange={() => setRefundFull(false)} /> Partial refund
            </label>
            {!refundFull && (
              <Input type="number" step="0.01" min="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Amount (USD)" />
            )}
            <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Reason (optional)" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundOpen(null)}>Cancel</Button>
            <Button disabled={refundM.isPending || (!refundFull && !(Number(refundAmount) > 0))} onClick={() => refundM.mutate()}>
              Issue refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}