import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { listParentsAdmin, updateParentAdmin } from "@/lib/admin-v2.functions";
import { exportPdfReport } from "@/lib/admin-pdf";
import { toast } from "sonner";
import { Search, Pencil, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/parents")({
  head: () => ({ meta: [{ title: "Parents — Admin" }] }),
  component: ParentsPage,
});

type Draft = {
  id: string;
  first_name: string; last_name: string;
  email: string; phone: string;
  address: string | null; admin_notes: string | null;
};

function ParentsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listParentsAdmin);
  const update = useServerFn(updateParentAdmin);
  const parents = useQuery({ queryKey: ["admin-parents"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Draft | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = parents.data ?? [];
    if (!t) return rows;
    return rows.filter((p: any) =>
      [p.first_name, p.last_name, p.email, p.phone, p.address].filter(Boolean).join(" ").toLowerCase().includes(t),
    );
  }, [parents.data, q]);

  const saveM = useMutation({
    mutationFn: (d: Draft) => update({ data: d }),
    onSuccess: () => {
      toast.success("Parent updated");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["admin-parents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportPdf() {
    exportPdfReport({
      title: "Parents Report",
      filename: `parents-${new Date().toISOString().slice(0, 10)}.pdf`,
      columns: ["Name", "Email", "Phone", "Students", "Address"],
      rows: filtered.map((p: any) => [
        `${p.first_name} ${p.last_name}`, p.email, p.phone,
        (p.students ?? []).map((s: any) => `${s.first_name} ${s.last_name}`).join(", "),
        p.address ?? "",
      ]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Parents</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {parents.data?.length ?? 0}</p>
        </div>
        <Button variant="outline" onClick={exportPdf} className="rounded-full">
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search parents…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">Name</th>
                <th className="py-2 px-4">Email</th>
                <th className="py-2 px-4">Phone</th>
                <th className="py-2 px-4">Students</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="py-2 px-4 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="py-2 px-4 text-muted-foreground">{p.email}</td>
                  <td className="py-2 px-4 text-muted-foreground">{p.phone}</td>
                  <td className="py-2 px-4">{(p.students ?? []).length}</td>
                  <td className="py-2 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <MessageParentButton parentId={p.id} parentName={`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email} />
                      <Button size="sm" variant="ghost" onClick={() => setEdit({
                        id: p.id, first_name: p.first_name ?? "", last_name: p.last_name ?? "",
                        email: p.email ?? "", phone: p.phone ?? "", address: p.address, admin_notes: p.admin_notes,
                      })}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-4 px-4 text-muted-foreground text-sm text-center">No parents.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit parent</DialogTitle>
            <DialogDescription>Update contact details and admin notes.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Input value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} placeholder="First name" />
                <Input value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} placeholder="Last name" />
              </div>
              <Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="Email" />
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="Phone" />
              <Textarea value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value || null })} placeholder="Address" rows={2} />
              <Textarea value={edit.admin_notes ?? ""} onChange={(e) => setEdit({ ...edit, admin_notes: e.target.value || null })} placeholder="Admin notes" rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={() => edit && saveM.mutate(edit)} disabled={saveM.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}