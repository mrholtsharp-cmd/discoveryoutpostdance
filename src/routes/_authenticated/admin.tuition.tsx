import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listTuitionItems, upsertTuitionItem, deleteTuitionItem } from "@/lib/tuition.functions";
import { toast } from "sonner";
import { Trash2, Pencil, Save, X, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tuition")({
  head: () => ({ meta: [{ title: "Admin · Tuition — Discovery Outpost" }] }),
  component: AdminTuitionPage,
});

const KIND_LABEL: Record<string, string> = {
  class_monthly: "Monthly tuition",
  class_semester: "Semester tuition",
  one_time: "One-time fee",
};
const KINDS = ["class_monthly", "class_semester", "one_time"] as const;

type Draft = {
  id?: string;
  kind: (typeof KINDS)[number];
  name: string;
  display_price: string;
  description: string;
  stripe_price_id: string;
  sort_order: number;
  active: boolean;
};

const empty: Draft = {
  kind: "class_monthly", name: "", display_price: "", description: "",
  stripe_price_id: "", sort_order: 0, active: true,
};

function AdminTuitionPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTuitionItems);
  const upsert = useServerFn(upsertTuitionItem);
  const del = useServerFn(deleteTuitionItem);

  const items = useQuery({ queryKey: ["tuition-items-admin"], queryFn: () => list() });
  const [editing, setEditing] = useState<Draft | null>(null);

  const saveM = useMutation({
    mutationFn: (d: Draft) => upsert({ data: d }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tuition-items-admin"] });
      qc.invalidateQueries({ queryKey: ["tuition-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["tuition-items-admin"] });
      qc.invalidateQueries({ queryKey: ["tuition-items"] });
    },
  });

  function rowsFor(kind: string) {
    return (items.data ?? []).filter((r) => r.kind === kind);
  }

  return (
    <Layout>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="text-xs uppercase tracking-[0.25em] text-primary">Studio Admin</span>
            <h1 className="font-display text-4xl mt-2">Tuition &amp; Fees</h1>
          </div>
          <Link to="/admin" className="text-sm text-primary hover:underline">← Back to admin</Link>
        </div>

        <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
          Edit the tuition and fee cards shown on the <Link to="/tuition" className="underline">Tuition page</Link>.
          These prices are shown to parents when they browse classes; the actual invoice amount is set
          per-request from the <Link to="/admin/invoice-requests" className="underline">Invoice Requests</Link> screen.
        </p>

        <div className="mt-6">
          <Button onClick={() => setEditing({ ...empty })} className="rounded-full">
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </div>

        {editing && (
          <Card className="mt-4 p-6">
            <h3 className="font-display text-xl mb-4">{editing.id ? "Edit item" : "New item"}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">Kind
                <Select value={editing.kind} onValueChange={(v) => setEditing((d) => d && { ...d, kind: v as Draft["kind"] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm">Name
                <Input className="mt-1" value={editing.name} onChange={(e) => setEditing((d) => d && { ...d, name: e.target.value })} placeholder="Ballet" />
              </label>
              <label className="text-sm">Display price
                <Input className="mt-1" value={editing.display_price} onChange={(e) => setEditing((d) => d && { ...d, display_price: e.target.value })} placeholder="$80/mo" />
              </label>
              <label className="text-sm">Reference code
                <Input className="mt-1" value={editing.stripe_price_id} onChange={(e) => setEditing((d) => d && { ...d, stripe_price_id: e.target.value })} placeholder="tuition_ballet_monthly" />
              </label>
              <label className="text-sm sm:col-span-2">Description
                <Input className="mt-1" value={editing.description} onChange={(e) => setEditing((d) => d && { ...d, description: e.target.value })} placeholder="Monthly tuition for Ballet." />
              </label>
              <label className="text-sm">Sort order
                <Input className="mt-1" type="number" value={editing.sort_order} onChange={(e) => setEditing((d) => d && { ...d, sort_order: Number(e.target.value) || 0 })} />
              </label>
              <label className="text-sm flex items-center gap-3 mt-6">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing((d) => d && { ...d, active: v })} />
                <span>Active (visible on Tuition page)</span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => editing && saveM.mutate(editing)}
                disabled={!editing.name || !editing.display_price || !editing.stripe_price_id || saveM.isPending}
              >
                <Save className="h-4 w-4" /> Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" /> Cancel
              </Button>
            </div>
          </Card>
        )}

        {KINDS.map((kind) => (
          <Card key={kind} className="mt-6 p-6">
            <h2 className="font-display text-2xl">{KIND_LABEL[kind]}</h2>
            <div className="mt-4 divide-y divide-border">
              {rowsFor(kind).map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1 min-w-0">
                    <span className="font-medium">{r.name}</span>
                    <span>{r.display_price}</span>
                    <span className="text-muted-foreground truncate">{r.description}</span>
                    <code className="text-xs text-muted-foreground">{r.stripe_price_id}</code>
                    {!r.active && <span className="text-xs text-amber-600">hidden</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing({
                      id: r.id, kind: r.kind as Draft["kind"], name: r.name,
                      display_price: r.display_price, description: r.description ?? "",
                      stripe_price_id: r.stripe_price_id, sort_order: r.sort_order ?? 0,
                      active: r.active,
                    })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (confirm(`Delete "${r.name}"?`)) delM.mutate(r.id);
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {rowsFor(kind).length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No items in this category.</p>
              )}
            </div>
          </Card>
        ))}
      </section>
    </Layout>
  );
}