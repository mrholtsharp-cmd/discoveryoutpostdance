import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  listInvoicesAdmin, updateInvoiceStatus, updateInvoiceAdmin, emailInvoice,
  backfillMissingInvoices,
  type InvoiceWithLines,
} from "@/lib/invoices.functions";
import { regenerateInvoicePaymentLink } from "@/lib/payments.functions";
import { refundInvoice } from "@/lib/refunds.functions";
import { runMonthlyRenewalManually } from "@/lib/monthly-invoices.functions";
import { invoiceAsText, downloadInvoicePdf, printInvoice } from "@/lib/invoice-format";
import { centsToUSD } from "@/lib/business";
import { LoadError } from "@/components/site/LoadError";
import { ArrowLeft, Search, Mail, Printer, Download, Copy, XCircle, CheckCircle2, AlertCircle, FileText, Pencil, Link2, RefreshCw, ExternalLink, Undo2, PlayCircle } from "lucide-react";
import { MessageParentButton } from "@/components/admin/MessageParentButton";

export const Route = createFileRoute("/_authenticated/admin/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Admin" }] }),
  component: AdminInvoicesPage,
});

const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-800 border-slate-200",
  sent: "bg-blue-100 text-blue-800 border-blue-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-zinc-200 text-zinc-700 border-zinc-300",
  refunded: "bg-purple-100 text-purple-800 border-purple-200",
  partial_refund: "bg-purple-50 text-purple-700 border-purple-200",
};

function fmtDate(d: string): string {
  return new Date(d + (d?.length === 10 ? "T00:00:00" : "")).toLocaleDateString();
}

function AdminInvoicesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInvoicesAdmin);
  const statusFn = useServerFn(updateInvoiceStatus);
  const updateFn = useServerFn(updateInvoiceAdmin);
  const emailFn = useServerFn(emailInvoice);
  const regenFn = useServerFn(regenerateInvoicePaymentLink);
  const refundFn = useServerFn(refundInvoice);
  const monthlyFn = useServerFn(runMonthlyRenewalManually);

  const q = useQuery({ queryKey: ["admin-invoices"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [editing, setEditing] = useState<InvoiceWithLines | null>(null);
  const [refunding, setRefunding] = useState<InvoiceWithLines | null>(null);

  const filtered = useMemo(() => {
    let out = q.data ?? [];
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    if (semesterFilter !== "all") out = out.filter((r) => String(r.semester_year) === semesterFilter);
    const t = search.trim().toLowerCase();
    if (t) {
      out = out.filter((r) =>
        [r.parent_name, r.parent_email, r.invoice_number, ...(r.line_items ?? []).map((l) => `${l.student_name ?? ""} ${l.description}`)]
          .join(" ").toLowerCase().includes(t),
      );
    }
    return out;
  }, [q.data, search, statusFilter, semesterFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { new: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0, refunded: 0, partial_refund: 0 };
    for (const r of q.data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [q.data]);

  const semesters = useMemo(() => {
    const s = new Set<string>();
    for (const r of q.data ?? []) s.add(String(r.semester_year));
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [q.data]);

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: any; send_email?: boolean }) => {
      const r = await statusFn({ data: v });
      if ("error" in r) throw new Error(r.error);
      return r;
    },
    onSuccess: (r: any) => {
      if (r?.emailed === true) toast.success("Marked as sent and email queued");
      else if (r?.emailed === false) toast.success("Marked as sent (email failed)");
      else toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailM = useMutation({
    mutationFn: async (id: string) => {
      const r = await emailFn({ data: { id } });
      if ("error" in r) throw new Error(r.error);
      return r;
    },
    onSuccess: () => { toast.success("Email queued"); qc.invalidateQueries({ queryKey: ["admin-invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const editM = useMutation({
    mutationFn: async (patch: any) => {
      const r = await updateFn({ data: patch });
      if ("error" in r) throw new Error(r.error);
      return r;
    },
    onSuccess: () => { toast.success("Saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenM = useMutation({
    mutationFn: async (invoiceId: string) => {
      const r: any = await regenFn({ data: { invoiceId } });
      if (r?.error) throw new Error(r.error);
      return r;
    },
    onSuccess: () => { toast.success("New payment link generated"); qc.invalidateQueries({ queryKey: ["admin-invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const refundM = useMutation({
    mutationFn: async (v: { invoiceId: string; amount_cents?: number; reason?: any; admin_note?: string }) => {
      const r: any = await refundFn({ data: v });
      if (r?.error) throw new Error(r.error);
      return r;
    },
    onSuccess: (r: any) => {
      toast.success(`Refunded $${((r.amount_cents ?? 0) / 100).toFixed(2)}`);
      setRefunding(null);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const monthlyM = useMutation({
    mutationFn: async () => await monthlyFn(),
    onSuccess: (r: any) => {
      toast.success(`Monthly run: ${r.invoices_created} created, ${r.deduped} already existed, ${r.errors?.length ?? 0} errors`);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backfillFn = useServerFn(backfillMissingInvoices);
  const backfillM = useMutation({
    mutationFn: async () => await backfillFn(),
    onSuccess: (r: any) => {
      toast.success(
        `Backfill: ${r.invoices_created} draft invoice(s) created, ${r.skipped_already_invoiced_pairs} enrollments already invoiced, ${r.errors?.length ?? 0} errors`,
        { duration: 8000 },
      );
      // eslint-disable-next-line no-console
      console.log("[backfill] summary", r);
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyInvoice(inv: InvoiceWithLines) {
    try {
      await navigator.clipboard.writeText(invoiceAsText(inv));
      toast.success("Invoice copied to clipboard");
    } catch { toast.error("Could not copy"); }
  }

  async function copyPaymentLink(url: string) {
    try { await navigator.clipboard.writeText(url); toast.success("Payment link copied"); }
    catch { toast.error("Could not copy"); }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <h1 className="font-display text-3xl">Invoices</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
              {q.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => monthlyM.mutate()} disabled={monthlyM.isPending}>
              <PlayCircle className="h-3.5 w-3.5" />
              {monthlyM.isPending ? "Running…" : "Run monthly renewal now"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Review missing invoices for enrolled students that don't have one yet? This creates DRAFT invoices only for your review — no emails, no payment links, and nothing shown to parents until you click Send Invoice on each one.")) {
                  backfillM.mutate();
                }
              }}
              disabled={backfillM.isPending}
            >
              <FileText className="h-3.5 w-3.5" />
              {backfillM.isPending ? "Reviewing…" : "Review missing invoices"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Registrations and monthly renewals auto-generate <strong>draft invoices</strong> for you to review. Click <strong>Send Invoice</strong> to generate the Stripe payment link, email the parent, and make the invoice payable in their portal.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatChip label="Draft / Not Sent" value={counts.new} tone="muted" />
        <StatChip label="Sent / Unpaid" value={counts.sent} tone="info" />
        <StatChip label="Paid" value={counts.paid} tone="good" />
        <StatChip label="Overdue" value={counts.overdue} tone="danger" />
        <StatChip label="Cancelled" value={counts.cancelled} />
        <StatChip label="Refunded" value={counts.refunded + counts.partial_refund} tone="muted" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by parent, email, student, invoice #…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">Draft / Not Sent</SelectItem>
            <SelectItem value="sent">Sent / Unpaid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="partial_refund">Partial refund</SelectItem>
            </SelectContent>
          </Select>
          <Select value={semesterFilter} onValueChange={setSemesterFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Semester" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All semesters</SelectItem>
              {semesters.map((s) => <SelectItem key={s} value={s}>Fall {s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {q.isError ? (
        <LoadError
          title="We couldn't load invoices"
          message={(q.error as Error)?.message || "Please try again."}
          onRetry={() => q.refetch()}
          retrying={q.isFetching}
        />
      ) : q.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No invoices match.</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((inv) => (
            <Card key={inv.id} className="p-5 space-y-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{inv.invoice_number}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[inv.status] ?? ""}`}>{inv.status}</span>
                    {inv.cash_payment && <Badge variant="outline" className="text-amber-800 border-amber-300">Cash pending</Badge>}
                  </div>
                  <p className="mt-1 font-medium">{inv.parent_name} <span className="text-xs text-muted-foreground">· {inv.parent_email}</span></p>
                  <p className="text-xs text-muted-foreground">
                    Created {fmtDate(inv.invoice_date)} · Due {fmtDate(inv.due_date)} · {inv.semester_label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.tuition_plan === "monthly" ? "Monthly tuition" : "Semester tuition"} · Prefers {inv.invoice_preference === "monthly" ? "monthly invoices" : "one semester invoice"}
                  </p>
                  <p className="text-xs text-muted-foreground">Instructor: Melissa</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl">{centsToUSD(inv.total_cents)}</p>
                  {inv.discount_cents > 0 && <p className="text-xs text-emerald-700">−{centsToUSD(inv.discount_cents)} discount</p>}
                </div>
              </div>

              <details className="rounded-md border bg-muted/20 p-3 text-sm">
                <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">Line items ({(inv.line_items ?? []).length})</summary>
                <table className="w-full text-sm mt-2">
                  <tbody>
                    {(inv.line_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map((li) => (
                      <tr key={li.id} className="border-t border-border/60">
                        <td className="py-1.5 pr-2">{li.student_name && <strong>{li.student_name}: </strong>}{li.description}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">{centsToUSD(li.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>

              {inv.status !== "new" && (
                <PaymentLinkPanel
                  inv={inv as any}
                  onCopy={copyPaymentLink}
                  onRegen={() => regenM.mutate(inv.id)}
                  regenerating={regenM.isPending}
                />
              )}

              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => copyInvoice(inv)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                <Button size="sm" variant="outline" onClick={() => printInvoice(inv)}><Printer className="h-3.5 w-3.5" /> Print</Button>
                <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(inv)}><Download className="h-3.5 w-3.5" /> PDF</Button>
                {(inv.status === "sent" || inv.status === "overdue") && (
                  <Button size="sm" variant="outline" onClick={() => emailM.mutate(inv.id)} disabled={emailM.isPending}>
                    <Mail className="h-3.5 w-3.5" /> Resend Invoice
                  </Button>
                )}
                {inv.status !== "paid" && inv.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(inv)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                )}
                {inv.status === "new" && (
                  <Button size="sm" onClick={() => setStatus.mutate({ id: inv.id, status: "sent", send_email: true })}>
                    <Mail className="h-3.5 w-3.5" /> Send Invoice
                  </Button>
                )}
                {inv.status === "overdue" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: inv.id, status: "sent", send_email: false })}>
                    <FileText className="h-3.5 w-3.5" /> Mark Sent
                  </Button>
                )}
                {(inv.status === "sent" || inv.status === "overdue") && (
                  <Button size="sm" onClick={() => setStatus.mutate({ id: inv.id, status: "paid" })}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                  </Button>
                )}
                {(inv.status === "sent") && (
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: inv.id, status: "overdue" })}>
                    <AlertCircle className="h-3.5 w-3.5" /> Overdue
                  </Button>
                )}
                {(inv.status === "paid" || (inv.status as string) === "partial_refund") && (inv as any).stripe_payment_intent_id && (
                  <Button size="sm" variant="outline" className="text-purple-800 border-purple-300" onClick={() => setRefunding(inv)}>
                    <Undo2 className="h-3.5 w-3.5" /> Refund
                  </Button>
                )}
                {(inv.status === "new" || inv.status === "sent" || inv.status === "overdue") && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Cancel this invoice?")) setStatus.mutate({ id: inv.id, status: "cancelled" }); }}>
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </Button>
                )}
                <MessageParentButton
                  parentId={(inv as any).parent_id}
                  parentEmail={inv.parent_email}
                  parentName={inv.parent_name}
                  defaultSubject={`Regarding invoice ${inv.invoice_number}`}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <EditInvoiceDialog invoice={editing} onClose={() => setEditing(null)} onSave={(p) => editM.mutate(p)} saving={editM.isPending} />
      <RefundDialog invoice={refunding} onClose={() => setRefunding(null)} onSubmit={(p: any) => refundM.mutate(p)} submitting={refundM.isPending} />
    </section>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone?: "info" | "good" | "danger" | "muted" }) {
  const cls =
    tone === "info" ? "text-blue-700" :
    tone === "good" ? "text-emerald-700" :
    tone === "danger" ? "text-red-700" :
    tone === "muted" ? "text-slate-700" : "text-foreground";
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl ${cls}`}>{value}</p>
    </Card>
  );
}

function PaymentLinkPanel({
  inv, onCopy, onRegen, regenerating,
}: { inv: any; onCopy: (u: string) => void; onRegen: () => void; regenerating: boolean }) {
  const isPaid = inv.status === "paid";
  const isCancelled = inv.status === "cancelled";
  const createdAt = inv.stripe_session_created_at ? new Date(inv.stripe_session_created_at) : null;
  const businessExpired = createdAt ? (Date.now() - createdAt.getTime() > 1000 * 60 * 60 * 24 * 30 * 4) : false;
  const stripeExpired = createdAt ? (Date.now() - createdAt.getTime() > 1000 * 60 * 60 * 23) : false;

  const linkStatus =
    isPaid ? { label: "Paid", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" } :
    isCancelled ? { label: "Cancelled", tone: "bg-zinc-200 text-zinc-700 border-zinc-300" } :
    businessExpired ? { label: "Expired (4-month)", tone: "bg-red-100 text-red-800 border-red-200" } :
    !inv.payment_url ? { label: "Not generated", tone: "bg-slate-100 text-slate-700 border-slate-200" } :
    stripeExpired ? { label: "Stale (regenerate)", tone: "bg-amber-100 text-amber-800 border-amber-200" } :
    { label: "Active", tone: "bg-blue-100 text-blue-800 border-blue-200" };

  return (
    <div className="rounded-md border bg-muted/10 p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment link</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${linkStatus.tone}`}>{linkStatus.label}</span>
        {createdAt && <span className="text-xs text-muted-foreground">created {createdAt.toLocaleString()}</span>}
      </div>
      {inv.stripe_session_id && (
        <p className="text-xs text-muted-foreground font-mono truncate">Session: {inv.stripe_session_id}</p>
      )}
      {inv.stripe_payment_intent_id && (
        <p className="text-xs text-muted-foreground font-mono truncate">Payment intent: {inv.stripe_payment_intent_id}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {inv.payment_url && !businessExpired && !isPaid && !isCancelled && (
          <>
            <Button size="sm" variant="outline" onClick={() => onCopy(inv.payment_url)}><Link2 className="h-3.5 w-3.5" /> Copy link</Button>
            <Button size="sm" variant="outline" onClick={() => window.open(inv.payment_url, "_blank")}><ExternalLink className="h-3.5 w-3.5" /> Open</Button>
          </>
        )}
        {!isPaid && !isCancelled && (
          <Button size="sm" variant="outline" onClick={onRegen} disabled={regenerating}>
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {inv.payment_url ? "Regenerate link" : "Generate link"}
          </Button>
        )}
      </div>
    </div>
  );
}

function EditInvoiceDialog({
  invoice, onClose, onSave, saving,
}: { invoice: InvoiceWithLines | null; onClose: () => void; onSave: (p: any) => void; saving: boolean }) {
  const [total, setTotal] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  useMemo(() => {
    if (invoice) {
      setTotal((invoice.total_cents / 100).toFixed(2));
      setDue(invoice.due_date);
      setNotes(invoice.notes ?? "");
      setAdminNotes(invoice.admin_notes ?? "");
    }
  }, [invoice?.id]);

  if (!invoice) return null;
  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit invoice {invoice.invoice_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Total (USD)</Label><Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
          <div><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div><Label>Notes (visible to parent)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div><Label>Admin notes (internal)</Label><Textarea rows={2} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={() => {
            const cents = Math.round(Number(total) * 100);
            if (!Number.isFinite(cents) || cents < 0) { toast.error("Invalid total"); return; }
            onSave({ id: invoice.id, total_cents: cents, due_date: due, notes: notes || null, admin_notes: adminNotes || null });
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function RefundDialog({
  invoice, onClose, onSubmit, submitting,
}: { invoice: InvoiceWithLines | null; onClose: () => void; onSubmit: (p: { invoiceId: string; amount_cents?: number; reason?: any; admin_note?: string }) => void; submitting: boolean }) {
  const alreadyRefunded = (invoice as any)?.refunded_amount_cents ?? 0;
  const remaining = invoice ? (invoice.total_cents - alreadyRefunded) : 0;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>("requested_by_customer");
  const [note, setNote] = useState("");
  useMemo(() => {
    if (invoice) { setAmount((remaining / 100).toFixed(2)); setNote(""); setReason("requested_by_customer"); }
  }, [invoice?.id]);
  if (!invoice) return null;
  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Refund {invoice.invoice_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paid: {centsToUSD(invoice.total_cents)}
            {alreadyRefunded > 0 && <> · Already refunded: {centsToUSD(alreadyRefunded)}</>}
            <> · Refundable: <strong>{centsToUSD(remaining)}</strong></>
          </p>
          <div>
            <Label>Refund amount (USD)</Label>
            <Input type="number" step="0.01" min="0.01" max={(remaining / 100).toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Leave the full remaining amount for a full refund.</p>
          </div>
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="requested_by_customer">Requested by customer</SelectItem>
                <SelectItem value="duplicate">Duplicate</SelectItem>
                <SelectItem value="fraudulent">Fraudulent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Internal note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this being refunded?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={submitting} onClick={() => {
            const cents = Math.round(Number(amount) * 100);
            if (!Number.isFinite(cents) || cents <= 0) { toast.error("Invalid amount"); return; }
            if (cents > remaining) { toast.error("Exceeds refundable amount"); return; }
            const isFull = cents === remaining;
            onSubmit({
              invoiceId: invoice.id,
              amount_cents: isFull ? undefined : cents,
              reason: reason as any,
              admin_note: note || undefined,
            });
          }}>{submitting ? "Refunding…" : "Issue refund"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
