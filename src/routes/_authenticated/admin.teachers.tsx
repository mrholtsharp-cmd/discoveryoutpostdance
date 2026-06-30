import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listTeachersAdmin } from "@/lib/admin-v2.functions";
import { exportPdfReport } from "@/lib/admin-pdf";
import { Search, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/teachers")({
  head: () => ({ meta: [{ title: "Teachers — Admin" }] }),
  component: TeachersPage,
});

function TeachersPage() {
  const list = useServerFn(listTeachersAdmin);
  const teachers = useQuery({ queryKey: ["admin-teachers"], queryFn: () => list() });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = teachers.data ?? [];
    if (!t) return r;
    return r.filter((x) =>
      [x.name, ...x.classes.map((c) => `${c.class_name} ${c.day}`)].join(" ").toLowerCase().includes(t),
    );
  }, [teachers.data, q]);

  function exportPdf() {
    exportPdfReport({
      title: "Teachers Report",
      filename: `teachers-${new Date().toISOString().slice(0,10)}.pdf`,
      columns: ["Teacher","Classes"],
      rows: filtered.map((t) => [t.name, t.classes.map((c) => `${c.day} ${c.class_name}`).join("; ")]),
    });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl">Teachers</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {teachers.data?.length ?? 0}. Add or rename teachers via the Classes page (instructor field).</p>
        </div>
        <Button variant="outline" onClick={exportPdf} className="rounded-full"><Download className="h-4 w-4" /> Export PDF</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search teachers…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t) => (
          <Card key={t.name} className="p-4">
            <div className="font-display text-lg">{t.name}</div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {t.classes.map((c) => (
                <li key={c.id}>{c.day} · {c.class_name} · {c.time}</li>
              ))}
            </ul>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No teachers configured yet.</p>
        )}
      </div>
    </section>
  );
}