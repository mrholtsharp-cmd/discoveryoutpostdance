import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import {
  previewDuplicateFees,
  runDuplicateFeeCleanupDrafts,
  correctSentInvoiceDuplicateFees,
  markPaidDuplicateReviewed,
  type DuplicateFeePreview,
  type DraftCleanupResult,
} from "@/lib/duplicate-fees.functions";

export const Route = createFileRoute("/_authenticated/admin/duplicate-fees")({
  head: () => ({ meta: [{ title: "Fix duplicate one-time fees — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function DupTable({ title, rows, renderAction }: { title: string; rows: any[]; renderAction?: (r: any) => React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="font-medium">{title}</h2>
        <Badge variant="outline">{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr>
                <th className="py-1 pr-3">Invoice</th>
                <th className="py-1 pr-3">Parent</th>
                <th className="py-1 pr-3">Duplicate of</th>
                <th className="py-1 pr-3">Category</th>
                <th className="py-1 pr-3">Amount</th>
                {renderAction && <th className="py-1 pr-3">Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.line_id} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.invoice_number} <span className="text-muted-foreground">({r.invoice_status})</span></td>
                  <td className="py-1.5 pr-3">{r.parent_name} <span className="text-xs text-muted-foreground">{r.parent_email}</span></td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.canonical_invoice_number}</td>
                  <td className="py-1.5 pr-3 text-xs">{r.category}</td>
                  <td className="py-1.5 pr-3">{usd(r.amount_cents)}</td>
                  {renderAction && <td className="py-1.5 pr-3">{renderAction(r)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Page() {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewDuplicateFees);
  const draftFn = useServerFn(runDuplicateFeeCleanupDrafts);
  const sentFn = useServerFn(correctSentInvoiceDuplicateFees);
  const paidFn = useServerFn(markPaidDuplicateReviewed);

  const [confirming, setConfirming] = useState(false);
  const [draftResult, setDraftResult] = useState<DraftCleanupResult | null>(null);

  const q = useQuery<DuplicateFeePreview>({
    queryKey: ["duplicate-fees-preview"],
    queryFn: () => previewFn({ data: {} as never }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["duplicate-fees-preview"] });
    qc.invalidateQueries({ queryKey: ["admin-invoices"] });
  };

  const runDrafts = useMutation({
    mutationFn: async () => await draftFn({ data: { confirm: true } }),
    onSuccess: (r) => {
      setDraftResult(r);
      setConfirming(false);
      toast.success(`Corrected ${r.draft_invoices_corrected} draft invoice(s); ${r.duplicate_lines_removed} line(s) removed`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const correctSent = useMutation({
    mutationFn: async (invoiceId: string) => await sentFn({ data: { invoiceId, resendEmail: true } }),
    onSuccess: (r: any) => {
      if ("error" in r) return toast.error(r.error);
      toast.success(`Corrected — removed ${r.removed}, new total ${usd(r.new_total_cents)}, ${r.emailed ? "email resent" : "email not sent"}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paidReview = useMutation({
    mutationFn: async (v: { invoiceId: string; action: "credit_next_invoice" | "refund_pending" | "reviewed_no_action" }) =>
      await paidFn({ data: v }),
    onSuccess: () => { toast.success("Marked"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = q.data;
  const totalDupLines = (p?.duplicate_registration_fee_lines ?? 0) + (p?.duplicate_recital_fee_lines ?? 0);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <Link to="/admin/invoices" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to invoices
        </Link>
        <h1 className="font-display text-3xl mt-2">Fix duplicate one-time fees</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Registration and recital fees should appear only on the first valid invoice per student
          per season. This tool audits existing invoices and safely corrects duplicates. Paid
          invoices are never modified silently.
        </p>
      </div>

      {q.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Auditing invoices…</Card>
      ) : q.isError ? (
        <Card className="p-8 text-center text-sm text-destructive">{(q.error as Error).message}</Card>
      ) : p ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Invoices checked</p><p className="font-display text-2xl">{p.invoices_checked}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Duplicate reg. fees</p><p className="font-display text-2xl">{p.duplicate_registration_fee_lines}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Duplicate recital fees</p><p className="font-display text-2xl">{p.duplicate_recital_fee_lines}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Drafts to auto-correct</p><p className="font-display text-2xl text-amber-700">{p.draft_lines_to_remove.length}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Stripe links to refresh</p><p className="font-display text-2xl">{p.stripe_links_to_regenerate}</p></Card>
          </div>

          <DupTable title="Draft (unsent) — will be auto-corrected" rows={p.draft_lines_to_remove} />
          <DupTable
            title="Sent / Overdue — needs admin confirmation per invoice"
            rows={p.sent_lines_needing_review}
            renderAction={(r) => (
              <Button size="sm" variant="outline" disabled={correctSent.isPending}
                onClick={() => {
                  if (confirm(`Correct ${r.invoice_number}? Removes the duplicate ${r.category} line, regenerates the Stripe link, and resends the invoice email.`)) {
                    correctSent.mutate(r.invoice_id);
                  }
                }}>
                Correct duplicate fees
              </Button>
            )}
          />
          <DupTable
            title="Paid — flag only (use refund workflow to return the duplicate amount)"
            rows={p.paid_lines_needing_review}
            renderAction={(r) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" disabled={paidReview.isPending}
                  onClick={() => paidReview.mutate({ invoiceId: r.invoice_id, action: "refund_pending" })}>
                  Refund pending
                </Button>
                <Button size="sm" variant="outline" disabled={paidReview.isPending}
                  onClick={() => paidReview.mutate({ invoiceId: r.invoice_id, action: "credit_next_invoice" })}>
                  Credit next
                </Button>
                <Button size="sm" variant="ghost" disabled={paidReview.isPending}
                  onClick={() => paidReview.mutate({ invoiceId: r.invoice_id, action: "reviewed_no_action" })}>
                  Reviewed
                </Button>
              </div>
            )}
          />
          <DupTable title="Other statuses (refunded / partial refund) — manual review" rows={p.other_status_lines} />

          <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {p.draft_lines_to_remove.length === 0
                ? totalDupLines === 0
                  ? "No duplicate one-time fees found."
                  : "No Draft invoices need auto-correction. Use the per-invoice actions above."
                : `${p.draft_lines_to_remove.length} draft line(s) will be removed. ${p.stripe_links_to_regenerate} Stripe link(s) will be regenerated.`}
            </div>
            {!confirming ? (
              <Button onClick={() => setConfirming(true)} disabled={p.draft_lines_to_remove.length === 0 || runDrafts.isPending}>
                Fix duplicate one-time fees (Drafts)
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={runDrafts.isPending}>Cancel</Button>
                <Button onClick={() => runDrafts.mutate()} disabled={runDrafts.isPending}>
                  {runDrafts.isPending ? "Fixing…" : `Confirm — correct ${p.draft_lines_to_remove.length} line(s)`}
                </Button>
              </div>
            )}
          </Card>

          {draftResult && (
            <Card className="p-4 space-y-1 text-sm">
              <h2 className="font-medium mb-2">Draft cleanup result</h2>
              <p>Draft invoices corrected: <strong>{draftResult.draft_invoices_corrected}</strong></p>
              <p>Duplicate line items removed: <strong>{draftResult.duplicate_lines_removed}</strong></p>
              <p>Stripe links regenerated: <strong>{draftResult.stripe_links_regenerated}</strong></p>
              {draftResult.errors.length > 0 && (
                <div className="mt-2 text-destructive">
                  <p className="font-medium">Errors:</p>
                  <ul className="list-disc pl-5">
                    {draftResult.errors.map((e, i) => <li key={i}><span className="font-mono">{e.invoice_number}</span>: {e.error}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      ) : null}
    </section>
  );
}