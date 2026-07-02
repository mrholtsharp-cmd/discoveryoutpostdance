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
  type InvoiceWithLines,
} from "@/lib/invoices.functions";
import { invoiceAsText, downloadInvoicePdf, printInvoice } from "@/lib/invoice-format";
import { centsToUSD } from "@/lib/business";
import { ArrowLeft, Search, Mail, Printer, Download, Copy, XCircle, CheckCircle2, AlertCircle, FileText, Pencil } from "lucide-react";

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

  const q = useQuery({ queryKey: ["admin-invoices"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [editing, setEditing] = useState<InvoiceWithLines | null>(null);

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
    const c: Record<string, number> = { new: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0 };
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

  async function copyInvoice(inv: InvoiceWithLines) {
    try {
      await navigator.clipboard.writeText(invoiceAsText(inv));
      toast.success("Invoice copied to clipboard");
    } catch { toast.error("Could not copy"); }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <h1 className="font-display text-3xl mt-2">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Every registration auto-generates an invoice. Set status, email, download PDF, print, or copy the invoice below.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatChip label="New" value={counts.new} tone="muted" />
        <StatChip label="Sent" value={counts.sent} tone="info" />
        <StatChip label="Paid" value={counts.paid} tone="good" />
        <StatChip label="Overdue" value={counts.overdue} tone="danger" />
        <StatChip label="Cancelled" value={counts.cancelled} />
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
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
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

      {q.isLoading ? (
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

              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => copyInvoice(inv)}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                <Button size="sm" variant="outline" onClick={() => printInvoice(inv)}><Printer className="h-3.5 w-3.5" /> Print</Button>
                <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(inv)}><Download className="h-3.5 w-3.5" /> PDF</Button>
                <Button size="sm" variant="outline" onClick={() => emailM.mutate(inv.id)} disabled={emailM.isPending}><Mail className="h-3.5 w-3.5" /> Email</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(inv)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                {inv.status !== "sent" && <Button size="sm" onClick={() => setStatus.mutate({ id: inv.id, status: "sent", send_email: true })}><FileText className="h-3.5 w-3.5" /> Mark Sent</Button>}
                {inv.status !== "paid" && <Button size="sm" onClick={() => setStatus.mutate({ id: inv.id, status: "paid" })}><CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid</Button>}
                {inv.status !== "overdue" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: inv.id, status: "overdue" })}><AlertCircle className="h-3.5 w-3.5" /> Overdue</Button>}
                {inv.status !== "cancelled" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Cancel this invoice?")) setStatus.mutate({ id: inv.id, status: "cancelled" }); }}><XCircle className="h-3.5 w-3.5" /> Cancel</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <EditInvoiceDialog invoice={editing} onClose={() => setEditing(null)} onSave={(p) => editM.mutate(p)} saving={editM.isPending} />
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