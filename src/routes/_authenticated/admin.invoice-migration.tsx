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
  previewInvoiceMigration,
  runInvoiceMigration,
  type MigrationPreview,
  type MigrationResult,
} from "@/lib/invoice-migration.functions";

export const Route = createFileRoute("/_authenticated/admin/invoice-migration")({
  head: () => ({ meta: [{ title: "Invoice migration — Admin" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

function usd(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function Section({ title, rows, action }: { title: string; rows: any[]; action: string }) {
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
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Total</th>
                <th className="py-1 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono text-xs">{r.invoice_number}</td>
                  <td className="py-1.5 pr-3">{r.parent_name} <span className="text-xs text-muted-foreground">{r.parent_email}</span></td>
                  <td className="py-1.5 pr-3">{r.status}{r.cash_payment ? " · cash" : ""}</td>
                  <td className="py-1.5 pr-3">{usd(r.total_cents)}</td>
                  <td className="py-1.5 pr-3 text-xs">{action}</td>
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
  const previewFn = useServerFn(previewInvoiceMigration);
  const runFn = useServerFn(runInvoiceMigration);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  const q = useQuery<MigrationPreview>({
    queryKey: ["invoice-migration-preview"],
    queryFn: () => previewFn(),
  });

  const runM = useMutation({
    mutationFn: async () => await runFn({ data: { confirm: true } }),
    onSuccess: (r) => {
      setResult(r);
      setConfirming(false);
      toast.success(`Migration complete: ${r.links_cleared} link(s) cleared`);
      qc.invalidateQueries({ queryKey: ["invoice-migration-preview"] });
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = q.data;
  const targetCount =
    (preview?.drafts_with_stale_link.length ?? 0) +
    (preview?.cash_drafts_with_link.length ?? 0) +
    (preview?.cancelled_with_link.length ?? 0);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <h1 className="font-display text-3xl mt-2">Invoice migration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-time cleanup that brings existing invoices into the current workflow. Only clears stale
          Stripe links on drafts, cash drafts, and cancelled invoices. Never touches totals, line
          items, status, paid records, refund records, or invoice numbers.
        </p>
      </div>

      {q.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading preview…</Card>
      ) : q.isError ? (
        <Card className="p-8 text-center text-sm text-destructive">{(q.error as Error).message}</Card>
      ) : preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Total invoices</p><p className="font-display text-2xl">{preview.total}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Compatible</p><p className="font-display text-2xl text-emerald-700">{preview.compatible.length}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Will be repaired</p><p className="font-display text-2xl text-amber-700">{targetCount}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Manual review</p><p className="font-display text-2xl">{preview.missing_line_items.length + preview.missing_parent_link.length + preview.duplicates_needing_review.length}</p></Card>
          </div>

          <Section title="Draft (non-cash) invoices with a stale Stripe link" rows={preview.drafts_with_stale_link} action="Clear link + expire Stripe session" />
          <Section title="Cash draft invoices with a Stripe link (should never have one)" rows={preview.cash_drafts_with_link} action="Clear link + expire Stripe session" />
          <Section title="Cancelled invoices with a live payment link" rows={preview.cancelled_with_link} action="Clear link + expire Stripe session" />
          <Section title="Paid invoices (preserved unchanged)" rows={preview.paid_preserved} action="No change" />
          <Section title="Refunded / partial refund (preserved unchanged)" rows={preview.refunded_preserved} action="No change" />
          <Section title="Missing line items — manual review" rows={preview.missing_line_items} action="Review manually" />
          <Section title="Missing parent link — manual review" rows={preview.missing_parent_link} action="Review manually" />

          {preview.duplicates_needing_review.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-medium">Possible duplicates — manual review</h2>
                <Badge variant="outline">{preview.duplicates_needing_review.length} group(s)</Badge>
              </div>
              {preview.duplicates_needing_review.map((grp, i) => (
                <div key={i} className="text-sm border-t border-border/60 py-2">
                  {grp.map((r) => (
                    <div key={r.id} className="flex flex-wrap gap-3">
                      <span className="font-mono text-xs">{r.invoice_number}</span>
                      <span>{r.parent_name}</span>
                      <span>{r.status}{r.cash_payment ? " · cash" : ""}</span>
                      <span>{usd(r.total_cents)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          )}

          <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {targetCount === 0
                ? "Nothing to migrate — all invoices are already clean."
                : `${targetCount} invoice(s) will have their Stripe link cleared. Nothing else changes.`}
            </div>
            {!confirming ? (
              <Button onClick={() => setConfirming(true)} disabled={targetCount === 0 || runM.isPending}>
                Run migration
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={runM.isPending}>Cancel</Button>
                <Button onClick={() => runM.mutate()} disabled={runM.isPending}>
                  {runM.isPending ? "Migrating…" : `Confirm — clear ${targetCount} link(s)`}
                </Button>
              </div>
            )}
          </Card>

          {result && (
            <Card className="p-4 space-y-1 text-sm">
              <h2 className="font-medium mb-2">Migration result</h2>
              <p>Links cleared: <strong>{result.links_cleared}</strong></p>
              <p>Stripe sessions expired: <strong>{result.sessions_expired}</strong> (already expired: {result.sessions_already_expired})</p>
              <p>Skipped (already migrated): <strong>{result.skipped_already_migrated}</strong></p>
              <p>Preserved paid: <strong>{result.preserved.paid}</strong> · refunded: <strong>{result.preserved.refunded}</strong></p>
              <p>Manual review — missing line items: {result.manual_review.missing_line_items}, missing parent: {result.manual_review.missing_parent_link}, duplicate groups: {result.manual_review.duplicate_groups}</p>
              {result.errors.length > 0 && (
                <div className="mt-2 text-destructive">
                  <p className="font-medium">Errors:</p>
                  <ul className="list-disc pl-5">
                    {result.errors.map((e, i) => <li key={i}><span className="font-mono">{e.invoice_number}</span>: {e.error}</li>)}
                  </ul>
                </div>
              )}
              <div className="pt-2">
                <Button asChild variant="outline" size="sm"><Link to="/admin/invoices">Back to invoices</Link></Button>
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </section>
  );
}