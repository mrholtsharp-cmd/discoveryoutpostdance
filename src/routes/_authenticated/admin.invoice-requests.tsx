import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listInvoiceRequestsAdmin,
  updateInvoiceRequestAdmin,
  updateInvoiceGroupAdmin,
  type InvoiceRequestRow,
} from "@/lib/invoice-requests.functions";
import { toast } from "sonner";
import { ArrowLeft, Search, Mail, CheckCircle2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/invoice-requests")({
  head: () => ({ meta: [{ title: "Invoice Requests — Admin" }] }),
  component: InvoiceRequestsAdmin,
});

type Grouped = {
  key: string;
  group_id: string | null;
  parent_id: string;
  email: string;
  parent_name: string;
  parent_phone: string | null;
  created_at: string;
  status: string;
  admin_notes: string | null;
  rows: InvoiceRequestRow[];
  totalMonthly: number;
  invoicedTotal: number | null;
};

function fmt(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-900 border-amber-200" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 border-blue-200" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled: { label: "Cancelled", className: "bg-zinc-200 text-zinc-700 border-zinc-300" },
};

function InvoiceRequestsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInvoiceRequestsAdmin);
  const updateRowFn = useServerFn(updateInvoiceRequestAdmin);
  const updateGroupFn = useServerFn(updateInvoiceGroupAdmin);

  const q = useQuery({ queryKey: ["admin-invoice-requests"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingRow, setEditingRow] = useState<InvoiceRequestRow | null>(null);

  const groups = useMemo<Grouped[]>(() => {
    const rows = q.data ?? [];
    const map = new Map<string, Grouped>();
    for (const r of rows) {
      const key = r.request_group_id ?? `single:${r.id}`;
      const parentName = [r.parent?.first_name, r.parent?.last_name].filter(Boolean).join(" ").trim() || "—";
      const existing = map.get(key);
      if (existing) {
        existing.rows.push(r);
        existing.totalMonthly += (r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1);
        if (r.invoiced_amount_cents != null) {
          existing.invoicedTotal = (existing.invoicedTotal ?? 0) + r.invoiced_amount_cents;
        }
      } else {
        map.set(key, {
          key,
          group_id: r.request_group_id,
          parent_id: r.parent_id,
          email: r.email,
          parent_name: parentName,
          parent_phone: r.parent?.phone ?? null,
          created_at: r.created_at,
          status: r.status,
          admin_notes: r.admin_notes,
          rows: [r],
          totalMonthly: (r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1),
          invoicedTotal: r.invoiced_amount_cents ?? null,
        });
      }
    }
    let out = Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (statusFilter !== "all") out = out.filter((g) => g.status === statusFilter);
    const t = search.trim().toLowerCase();
    if (t) {
      out = out.filter((g) =>
        [g.parent_name, g.email, ...g.rows.map((r) => `${r.student_name ?? ""} ${r.class_label}`)]
          .join(" ")
          .toLowerCase()
          .includes(t),
      );
    }
    return out;
  }, [q.data, search, statusFilter]);

  const setGroupStatusM = useMutation({
    mutationFn: async (vars: { group_id: string; status: "pending" | "sent" | "paid" | "cancelled" }) => {
      const res = await updateGroupFn({ data: { group_id: vars.group_id, status: vars.status } });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-invoice-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRowM = useMutation({
    mutationFn: async (vars: { id: string; invoiced_amount_cents?: number | null; status?: "pending" | "sent" | "paid" | "cancelled"; admin_notes?: string | null }) => {
      const res = await updateRowFn({ data: vars });
      if ("error" in res) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditingRow(null);
      qc.invalidateQueries({ queryKey: ["admin-invoice-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const rows = q.data ?? [];
    const c: Record<string, number> = { pending: 0, sent: 0, paid: 0, cancelled: 0 };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [q.data]);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to admin
          </Link>
          <h1 className="font-display text-3xl mt-2">Invoice Requests</h1>
          <p className="text-sm text-muted-foreground">
            Manage invoices for registered families. Set the amount, mark as sent, and mark as paid.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatChip label="Pending" value={counts.pending ?? 0} tone="warn" />
        <StatChip label="Sent" value={counts.sent ?? 0} tone="info" />
        <StatChip label="Paid" value={counts.paid ?? 0} tone="good" />
        <StatChip label="Cancelled" value={counts.cancelled ?? 0} />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by parent, email, student, or class…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {q.isLoading ? (
        <Card className="p-8"><p className="text-sm text-muted-foreground text-center">Loading…</p></Card>
      ) : groups.length === 0 ? (
        <Card className="p-8"><p className="text-sm text-muted-foreground text-center">No invoice requests yet.</p></Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const s = STATUS_LABEL[g.status] ?? { label: g.status, className: "bg-muted" };
            return (
              <Card key={g.key} className="p-5 space-y-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{g.parent_name}</span>
                      <span className="text-xs text-muted-foreground">· {g.email}</span>
                      {g.parent_phone && <span className="text-xs text-muted-foreground">· {g.parent_phone}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted {fmtDate(g.created_at)} · {g.rows.length} line item{g.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${s.className}`}>
                    {s.label}
                  </span>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Student</th>
                        <th className="text-left px-3 py-2">Class</th>
                        <th className="text-right px-3 py-2">Monthly</th>
                        <th className="text-right px-3 py-2">Months</th>
                        <th className="text-right px-3 py-2">Est. total</th>
                        <th className="text-right px-3 py-2">Invoice amt.</th>
                        <th className="text-right px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => {
                        const est = (r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1);
                        return (
                          <tr key={r.id} className="border-t border-border/60">
                            <td className="px-3 py-2">{r.student_name ?? "—"}</td>
                            <td className="px-3 py-2">{r.class_label}</td>
                            <td className="px-3 py-2 text-right">{fmt(r.monthly_amount_cents)}</td>
                            <td className="px-3 py-2 text-right">{r.months_remaining}</td>
                            <td className="px-3 py-2 text-right">{fmt(est)}</td>
                            <td className="px-3 py-2 text-right font-medium">
                              {r.invoiced_amount_cents != null ? fmt(r.invoiced_amount_cents) : <span className="text-muted-foreground">not set</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button size="sm" variant="ghost" onClick={() => setEditingRow(r)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/20">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Totals</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(g.totalMonthly)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(g.invoicedTotal)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {g.admin_notes && (
                  <p className="text-xs text-muted-foreground italic">Notes: {g.admin_notes}</p>
                )}

                <div className="flex flex-wrap gap-2 items-center justify-end">
                  {g.group_id && g.status !== "sent" && (
                    <Button size="sm" variant="outline"
                      disabled={setGroupStatusM.isPending}
                      onClick={() => setGroupStatusM.mutate({ group_id: g.group_id!, status: "sent" })}>
                      <Mail className="h-3.5 w-3.5" /> Mark as sent
                    </Button>
                  )}
                  {g.group_id && g.status !== "paid" && (
                    <Button size="sm"
                      disabled={setGroupStatusM.isPending}
                      onClick={() => setGroupStatusM.mutate({ group_id: g.group_id!, status: "paid" })}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark as paid
                    </Button>
                  )}
                  {g.group_id && g.status !== "cancelled" && (
                    <Button size="sm" variant="ghost" className="text-destructive"
                      disabled={setGroupStatusM.isPending}
                      onClick={() => {
                        if (confirm("Cancel this invoice request?")) {
                          setGroupStatusM.mutate({ group_id: g.group_id!, status: "cancelled" });
                        }
                      }}>
                      Cancel
                    </Button>
                  )}
                  {g.status !== "pending" && g.group_id && (
                    <Button size="sm" variant="ghost"
                      disabled={setGroupStatusM.isPending}
                      onClick={() => setGroupStatusM.mutate({ group_id: g.group_id!, status: "pending" })}>
                      Reopen
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <EditRowDialog
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={(patch) => setRowM.mutate(patch)}
        saving={setRowM.isPending}
      />
    </section>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone?: "warn" | "good" | "info" }) {
  const toneClass =
    tone === "warn" ? "text-amber-700" :
    tone === "good" ? "text-emerald-700" :
    tone === "info" ? "text-blue-700" : "text-foreground";
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl ${toneClass}`}>{value}</p>
    </Card>
  );
}

function EditRowDialog({
  row, onClose, onSave, saving,
}: {
  row: InvoiceRequestRow | null;
  onClose: () => void;
  onSave: (v: { id: string; invoiced_amount_cents?: number | null; status?: "pending" | "sent" | "paid" | "cancelled"; admin_notes?: string | null }) => void;
  saving: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"pending" | "sent" | "paid" | "cancelled">("pending");
  const [notes, setNotes] = useState("");

  useMemo(() => {
    if (row) {
      setAmount(row.invoiced_amount_cents != null ? (row.invoiced_amount_cents / 100).toFixed(2) : "");
      setStatus((row.status as any) ?? "pending");
      setNotes(row.admin_notes ?? "");
    }
  }, [row?.id]);

  if (!row) return null;

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit invoice line</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Class</Label>
            <p className="text-sm">{row.class_label}{row.student_name ? ` · ${row.student_name}` : ""}</p>
            <p className="text-xs text-muted-foreground">
              Estimate {fmt(row.monthly_amount_cents)}/mo × {row.months_remaining}
            </p>
          </div>
          <div>
            <Label className="text-sm">Final invoice amount (USD)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={amount}
              placeholder="e.g. 320.00"
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Leave blank to clear.</p>
          </div>
          <div>
            <Label className="text-sm">Status</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Admin notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={() => {
              const parsed = amount.trim() === "" ? null : Math.round(Number(amount) * 100);
              if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
                toast.error("Invalid amount");
                return;
              }
              onSave({
                id: row.id,
                invoiced_amount_cents: parsed,
                status,
                admin_notes: notes.trim() === "" ? null : notes,
              });
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Badge_unused() { return <Badge />; }
void Badge_unused;