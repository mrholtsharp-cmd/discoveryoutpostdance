import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listWaitlistsAdmin, approveWaitlistEntry, removeWaitlistEntry,
} from "@/lib/admin-v2.functions";
import { exportPdfReport } from "@/lib/admin-pdf";
import { toast } from "sonner";
import { Search, Check, X, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/waitlists")({
  head: () => ({ meta: [{ title: "Waitlists — Admin" }] }),
  component: WaitlistsPage,
});

function WaitlistsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listWaitlistsAdmin);
  const approve = useServerFn(approveWaitlistEntry);
  const remove = useServerFn(removeWaitlistEntry);
  const rows = useQuery({ queryKey: ["admin-waitlists"], queryFn: () => list() });

  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = rows.data ?? [];
    if (!t) return r;
    return r.filter((w: any) => [
      w.class_schedule?.class_name, w.class_schedule?.day,
      w.students?.first_name, w.students?.last_name,
      w.students?.parents?.email, w.students?.parents?.first_name, w.students?.parents?.last_name,
    ].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [rows.data, q]);

  const approveM = useMutation({
    mutationFn: (id: string) => approve({ data: { waitlist_id: id } }).then((r) => { if ("error" in r) throw new Error(r.error); return r; }),
    onSuccess: () => {
      toast.success("Approved & enrolled");
      qc.invalidateQueries({ queryKey: ["admin-waitlists"] });
      qc.invalidateQueries({ queryKey: ["admin-overview-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { waitlist_id: id } }),
    onSuccess: () => {
      toast.success("Removed from waitlist");
      qc.invalidateQueries({ queryKey: ["admin-waitlists"] });
    },
  });

  function exportPdf() {
    exportPdfReport({
      title: "Waitlists Report",
      filename: `waitlists-${new Date().toISOString().slice(0,10)}.pdf`,
      columns: ["Class","Day","Position","Student","Parent","Email"],
      rows: filtered.map((w: any) => [
        w.class_schedule?.class_name ?? "", w.class_schedule?.day ?? "",
        w.wait_position,
        `${w.students?.first_name ?? ""} ${w.students?.last_name ?? ""}`,
        w.students?.parents ? `${w.students.parents.first_name} ${w.students.parents.last_name}` : "",
        w.students?.parents?.email ?? "",
      ]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Waitlists</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {rows.data?.length ?? 0}</p>
        </div>
        <Button variant="outline" onClick={exportPdf} className="rounded-full"><Download className="h-4 w-4" /> Export PDF</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search waitlists…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">#</th>
                <th className="py-2 px-4">Class</th>
                <th className="py-2 px-4">Student</th>
                <th className="py-2 px-4">Parent</th>
                <th className="py-2 px-4">Joined</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w: any) => (
                <tr key={w.id} className="border-b border-border/60">
                  <td className="py-2 px-4 font-mono text-xs">{w.wait_position}</td>
                  <td className="py-2 px-4 font-medium">{w.class_schedule?.class_name} <span className="text-xs text-muted-foreground">· {w.class_schedule?.day} · {w.class_schedule?.time}</span></td>
                  <td className="py-2 px-4">{w.students?.first_name} {w.students?.last_name}</td>
                  <td className="py-2 px-4 text-muted-foreground">{w.students?.parents?.first_name} {w.students?.parents?.last_name}<div className="text-xs">{w.students?.parents?.email}</div></td>
                  <td className="py-2 px-4 text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => approveM.mutate(w.id)} disabled={approveM.isPending}>
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Remove from waitlist?")) removeM.mutate(w.id); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-4 px-4 text-muted-foreground text-sm text-center">No waitlist entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}