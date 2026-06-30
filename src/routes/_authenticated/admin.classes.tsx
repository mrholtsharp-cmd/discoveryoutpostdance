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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listClassesAdmin, upsertClassAdmin, deleteClassAdmin } from "@/lib/admin-v2.functions";
import { exportPdfReport } from "@/lib/admin-pdf";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Plus, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/classes")({
  head: () => ({ meta: [{ title: "Classes — Admin" }] }),
  component: ClassesPage,
});

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

type Draft = {
  id?: string; day: string; class_name: string; time: string;
  capacity: number | null; sort_order: number;
  description: string | null; age_group: string | null;
  instructor: string | null; monthly_tuition_cents: number | null;
};

const empty: Draft = {
  day: "Monday", class_name: "", time: "", capacity: null, sort_order: 0,
  description: null, age_group: null, instructor: null, monthly_tuition_cents: null,
};

function ClassesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listClassesAdmin);
  const upsert = useServerFn(upsertClassAdmin);
  const del = useServerFn(deleteClassAdmin);

  const classes = useQuery({ queryKey: ["admin-classes"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Draft | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = classes.data ?? [];
    if (!t) return rows;
    return rows.filter((c: any) =>
      [c.class_name, c.day, c.instructor, c.age_group, c.time].filter(Boolean).join(" ").toLowerCase().includes(t),
    );
  }, [classes.data, q]);

  const saveM = useMutation({
    mutationFn: (d: Draft) => upsert({ data: d }),
    onSuccess: () => {
      toast.success("Class saved");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      qc.invalidateQueries({ queryKey: ["admin-overview-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Class deleted");
      qc.invalidateQueries({ queryKey: ["admin-classes"] });
      qc.invalidateQueries({ queryKey: ["admin-overview-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportPdf() {
    exportPdfReport({
      title: "Classes Report",
      filename: `classes-${new Date().toISOString().slice(0,10)}.pdf`,
      columns: ["Day","Class","Time","Age group","Instructor","Capacity","Tuition (¢)"],
      rows: filtered.map((c: any) => [
        c.day, c.class_name, c.time, c.age_group ?? "", c.instructor ?? "",
        c.capacity ?? "", c.monthly_tuition_cents ?? "",
      ]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Classes</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {classes.data?.length ?? 0}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPdf} className="rounded-full"><Download className="h-4 w-4" /> Export PDF</Button>
          <Button onClick={() => setEdit({ ...empty })} className="rounded-full"><Plus className="h-4 w-4" /> New class</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search classes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">Day</th>
                <th className="py-2 px-4">Class</th>
                <th className="py-2 px-4">Time</th>
                <th className="py-2 px-4">Age</th>
                <th className="py-2 px-4">Instructor</th>
                <th className="py-2 px-4">Capacity</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="py-2 px-4">{c.day}</td>
                  <td className="py-2 px-4 font-medium">{c.class_name}</td>
                  <td className="py-2 px-4 text-muted-foreground">{c.time}</td>
                  <td className="py-2 px-4 text-muted-foreground">{c.age_group ?? "—"}</td>
                  <td className="py-2 px-4 text-muted-foreground">{c.instructor ?? "—"}</td>
                  <td className="py-2 px-4">{c.capacity ?? "—"}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEdit({
                      id: c.id, day: c.day, class_name: c.class_name, time: c.time,
                      capacity: c.capacity, sort_order: c.sort_order ?? 0,
                      description: c.description, age_group: c.age_group,
                      instructor: c.instructor, monthly_tuition_cents: c.monthly_tuition_cents,
                    })}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${c.class_name}?`)) delM.mutate(c.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-4 px-4 text-muted-foreground text-sm text-center">No classes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit class" : "New class"}</DialogTitle>
            <DialogDescription>Day, time, capacity and tuition settings.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Select value={edit.day} onValueChange={(v) => setEdit({ ...edit, day: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} placeholder="Time (e.g. 4:00 - 5:00 PM)" />
              </div>
              <Input value={edit.class_name} onChange={(e) => setEdit({ ...edit, class_name: e.target.value })} placeholder="Class name" />
              <div className="grid grid-cols-2 gap-3">
                <Input value={edit.age_group ?? ""} onChange={(e) => setEdit({ ...edit, age_group: e.target.value || null })} placeholder="Age group" />
                <Input value={edit.instructor ?? ""} onChange={(e) => setEdit({ ...edit, instructor: e.target.value || null })} placeholder="Instructor / Teacher" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" min={0} value={edit.capacity ?? ""} onChange={(e) => setEdit({ ...edit, capacity: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Capacity" />
                <Input type="number" min={0} value={edit.monthly_tuition_cents ?? ""} onChange={(e) => setEdit({ ...edit, monthly_tuition_cents: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Monthly tuition (cents)" />
              </div>
              <Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value || null })} placeholder="Description" rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button disabled={!edit?.class_name || !edit?.time || saveM.isPending} onClick={() => edit && saveM.mutate(edit)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}