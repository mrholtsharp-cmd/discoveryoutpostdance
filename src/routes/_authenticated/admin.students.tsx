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
import {
  listStudentsAdmin, updateStudentAdmin, moveStudentToClass, listClassesAdmin,
} from "@/lib/admin-v2.functions";
import { exportPdfReport } from "@/lib/admin-pdf";
import { toast } from "sonner";
import { Search, Pencil, MoveRight, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/students")({
  head: () => ({ meta: [{ title: "Students — Admin" }] }),
  component: StudentsPage,
});

type Draft = {
  id: string;
  first_name: string; last_name: string;
  date_of_birth: string | null; grade: string | null;
  allergies: string | null; medical_notes: string | null; admin_notes: string | null;
};

function StudentsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listStudentsAdmin);
  const update = useServerFn(updateStudentAdmin);
  const move = useServerFn(moveStudentToClass);
  const classesFn = useServerFn(listClassesAdmin);

  const students = useQuery({ queryKey: ["admin-students"], queryFn: () => list() });
  const classes = useQuery({ queryKey: ["admin-classes"], queryFn: () => classesFn() });

  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Draft | null>(null);
  const [moveOpen, setMoveOpen] = useState<{ id: string; name: string } | null>(null);
  const [moveToClass, setMoveToClass] = useState<string>("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = students.data ?? [];
    if (!term) return rows;
    return rows.filter((s: any) => {
      const hay = [
        s.first_name, s.last_name, s.grade, s.parents?.first_name, s.parents?.last_name,
        s.parents?.email, s.parents?.phone,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [students.data, q]);

  const saveM = useMutation({
    mutationFn: (d: Draft) => update({ data: d }),
    onSuccess: () => {
      toast.success("Student updated");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveM = useMutation({
    mutationFn: (vars: { student_id: string; to_class_id: string }) =>
      move({ data: { ...vars, from_class_id: null } }),
    onSuccess: () => {
      toast.success("Student moved");
      setMoveOpen(null); setMoveToClass("");
      qc.invalidateQueries({ queryKey: ["admin-students"] });
      qc.invalidateQueries({ queryKey: ["admin-overview-v2"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportPdf() {
    exportPdfReport({
      title: "Students Report",
      filename: `students-${new Date().toISOString().slice(0, 10)}.pdf`,
      columns: ["First name", "Last name", "DOB", "Grade", "Parent", "Email", "Phone"],
      rows: filtered.map((s: any) => [
        s.first_name, s.last_name, s.date_of_birth ?? "", s.grade ?? "",
        s.parents ? `${s.parents.first_name} ${s.parents.last_name}` : "",
        s.parents?.email ?? "", s.parents?.phone ?? "",
      ]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Students</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {students.data?.length ?? 0}</p>
        </div>
        <Button variant="outline" onClick={exportPdf} className="rounded-full">
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search students, parents…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">Student</th>
                <th className="py-2 px-4">DOB</th>
                <th className="py-2 px-4">Grade</th>
                <th className="py-2 px-4">Parent</th>
                <th className="py-2 px-4">Contact</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-b border-border/60">
                  <td className="py-2 px-4 font-medium">{s.first_name} {s.last_name}</td>
                  <td className="py-2 px-4 text-muted-foreground">{s.date_of_birth ?? "—"}</td>
                  <td className="py-2 px-4 text-muted-foreground">{s.grade ?? "—"}</td>
                  <td className="py-2 px-4">{s.parents ? `${s.parents.first_name} ${s.parents.last_name}` : "—"}</td>
                  <td className="py-2 px-4 text-muted-foreground">{s.parents?.email}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEdit({
                      id: s.id, first_name: s.first_name, last_name: s.last_name,
                      date_of_birth: s.date_of_birth, grade: s.grade,
                      allergies: s.allergies, medical_notes: s.medical_notes, admin_notes: s.admin_notes,
                    })}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMoveOpen({ id: s.id, name: `${s.first_name} ${s.last_name}` })}>
                      <MoveRight className="h-3.5 w-3.5" /> Move
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-4 px-4 text-muted-foreground text-sm text-center">No students.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
            <DialogDescription>Update student details and admin notes.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Input value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} placeholder="First name" />
                <Input value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} placeholder="Last name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={edit.date_of_birth ?? ""} onChange={(e) => setEdit({ ...edit, date_of_birth: e.target.value || null })} />
                <Input value={edit.grade ?? ""} onChange={(e) => setEdit({ ...edit, grade: e.target.value || null })} placeholder="Grade" />
              </div>
              <Textarea value={edit.allergies ?? ""} onChange={(e) => setEdit({ ...edit, allergies: e.target.value || null })} placeholder="Allergies" rows={2} />
              <Textarea value={edit.medical_notes ?? ""} onChange={(e) => setEdit({ ...edit, medical_notes: e.target.value || null })} placeholder="Medical notes" rows={2} />
              <Textarea value={edit.admin_notes ?? ""} onChange={(e) => setEdit({ ...edit, admin_notes: e.target.value || null })} placeholder="Admin notes (internal only)" rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={() => edit && saveM.mutate(edit)} disabled={saveM.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveOpen} onOpenChange={(o) => !o && setMoveOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {moveOpen?.name}</DialogTitle>
            <DialogDescription>Add this student to a class. Existing enrollments are kept.</DialogDescription>
          </DialogHeader>
          <Select value={moveToClass} onValueChange={setMoveToClass}>
            <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {classes.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.day} · {c.class_name} · {c.time}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveOpen(null)}>Cancel</Button>
            <Button disabled={!moveToClass || moveM.isPending}
              onClick={() => moveOpen && moveM.mutate({ student_id: moveOpen.id, to_class_id: moveToClass })}>
              Add to class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}