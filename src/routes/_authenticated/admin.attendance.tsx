import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listClassesAdmin, listAttendanceForClass, recordAttendance,
} from "@/lib/admin-v2.functions";
import { exportPdfReport } from "@/lib/admin-pdf";
import { toast } from "sonner";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  head: () => ({ meta: [{ title: "Attendance — Admin" }] }),
  component: AttendancePage,
});

const STATUS: Array<{ value: "present"|"absent"|"late"|"excused"; label: string; color: string }> = [
  { value: "present", label: "Present", color: "bg-emerald-100 text-emerald-700" },
  { value: "absent",  label: "Absent",  color: "bg-red-100 text-red-700" },
  { value: "late",    label: "Late",    color: "bg-amber-100 text-amber-700" },
  { value: "excused", label: "Excused", color: "bg-blue-100 text-blue-700" },
];

function AttendancePage() {
  const qc = useQueryClient();
  const classesFn = useServerFn(listClassesAdmin);
  const listFn = useServerFn(listAttendanceForClass);
  const recordFn = useServerFn(recordAttendance);

  const classes = useQuery({ queryKey: ["admin-classes"], queryFn: () => classesFn() });
  const [classId, setClassId] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const sheet = useQuery({
    queryKey: ["attendance", classId, date],
    queryFn: () => listFn({ data: { class_id: classId, class_date: date } }),
    enabled: !!classId && !!date,
  });

  const markM = useMutation({
    mutationFn: (vars: { enrollment_id: string; status: "present"|"absent"|"late"|"excused"; notes?: string }) =>
      recordFn({ data: { enrollment_id: vars.enrollment_id, class_date: date, status: vars.status, notes: vars.notes ?? null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", classId, date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportPdf() {
    const cls = classes.data?.find((c) => c.id === classId);
    exportPdfReport({
      title: `Attendance — ${cls?.class_name ?? ""} · ${date}`,
      filename: `attendance-${cls?.class_name ?? "class"}-${date}.pdf`,
      columns: ["Student","Status","Notes"],
      rows: (sheet.data ?? []).map((r: any) => [
        `${r.student?.first_name ?? ""} ${r.student?.last_name ?? ""}`,
        r.mark?.status ?? "—",
        r.mark?.notes ?? "",
      ]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Attendance</h1>
          <p className="text-sm text-muted-foreground">Record present / absent / late / excused per class & date.</p>
        </div>
        <Button variant="outline" onClick={exportPdf} disabled={!classId || !(sheet.data ?? []).length} className="rounded-full">
          <Download className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      <div className="grid sm:grid-cols-[1fr_200px] gap-3">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
          <SelectContent>
            {classes.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.day} · {c.class_name} · {c.time}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="py-2 px-4">Student</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(sheet.data ?? []).map((r: any) => {
                const current = r.mark?.status as ("present"|"absent"|"late"|"excused"|undefined);
                return (
                  <tr key={r.enrollment_id} className="border-b border-border/60">
                    <td className="py-2 px-4 font-medium">{r.student?.first_name} {r.student?.last_name}</td>
                    <td className="py-2 px-4">
                      <div className="flex flex-wrap gap-1">
                        {STATUS.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => markM.mutate({ enrollment_id: r.enrollment_id, status: s.value, notes: r.mark?.notes ?? undefined })}
                            className={`text-xs rounded-full px-2 py-1 border ${current === s.value ? s.color + " border-transparent font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      <Input
                        defaultValue={r.mark?.notes ?? ""}
                        placeholder="Optional notes"
                        onBlur={(e) => {
                          const notes = e.target.value;
                          if (notes !== (r.mark?.notes ?? "")) {
                            if (current) markM.mutate({ enrollment_id: r.enrollment_id, status: current, notes });
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {!classId && (
                <tr><td colSpan={3} className="py-6 px-4 text-muted-foreground text-sm text-center">Select a class to start recording.</td></tr>
              )}
              {classId && (sheet.data ?? []).length === 0 && !sheet.isLoading && (
                <tr><td colSpan={3} className="py-6 px-4 text-muted-foreground text-sm text-center">No active enrollments.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}