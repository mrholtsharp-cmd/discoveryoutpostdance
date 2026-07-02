import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listContactAdmin, replyToContact, updateContactStatus, type ContactRow } from "@/lib/contact.functions";
import { ArrowLeft, Search, Mail, Reply, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/contact")({
  head: () => ({ meta: [{ title: "Contact Submissions — Admin" }] }),
  component: AdminContactPage,
});

function AdminContactPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContactAdmin);
  const replyFn = useServerFn(replyToContact);
  const statusFn = useServerFn(updateContactStatus);
  const q = useQuery({ queryKey: ["admin-contact"], queryFn: () => listFn() });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [replying, setReplying] = useState<ContactRow | null>(null);
  const [reply, setReply] = useState("");

  const filtered = useMemo(() => {
    let out = q.data ?? [];
    if (statusFilter !== "all") out = out.filter((r) => r.status === statusFilter);
    const t = search.trim().toLowerCase();
    if (t) out = out.filter((r) => [r.name, r.email, r.subject, r.message].join(" ").toLowerCase().includes(t));
    return out;
  }, [q.data, search, statusFilter]);

  const replyM = useMutation({
    mutationFn: async () => {
      const r = await replyFn({ data: { id: replying!.id, reply, status: "replied" } });
      if ("error" in r) throw new Error(r.error);
    },
    onSuccess: () => { toast.success("Reply sent"); setReplying(null); setReply(""); qc.invalidateQueries({ queryKey: ["admin-contact"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: async (v: { id: string; status: "new" | "replied" | "resolved" }) => {
      const r = await statusFn({ data: v });
      if ("error" in r) throw new Error(r.error);
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-contact"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-4">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <h1 className="font-display text-3xl mt-2">Contact Submissions</h1>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {q.isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No submissions.</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="p-5 space-y-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{c.name}</p>
                    <span className="text-xs text-muted-foreground">· {c.email}{c.phone ? ` · ${c.phone}` : ""}</span>
                    <Badge variant={c.status === "new" ? "secondary" : c.status === "resolved" ? "outline" : "default"} className="text-[10px]">{c.status}</Badge>
                  </div>
                  <p className="text-sm font-semibold mt-1">{c.subject}</p>
                  <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md">{c.message}</p>
              {c.admin_reply && (
                <div className="text-sm border-l-4 border-primary/40 pl-3 py-1">
                  <p className="text-xs text-muted-foreground">Replied {c.replied_at ? new Date(c.replied_at).toLocaleString() : ""}</p>
                  <p className="whitespace-pre-wrap">{c.admin_reply}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setReplying(c); setReply(c.admin_reply ?? ""); }}>
                  <Reply className="h-3.5 w-3.5" /> Reply
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`mailto:${c.email}?subject=Re: ${encodeURIComponent(c.subject)}`}><Mail className="h-3.5 w-3.5" /> Email</a>
                </Button>
                {c.status !== "resolved" && (
                  <Button size="sm" onClick={() => statusM.mutate({ id: c.id, status: "resolved" })}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!replying} onOpenChange={(v) => !v && setReplying(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Reply to {replying?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Re: {replying?.subject} · {replying?.email}
            </div>
            <Textarea rows={8} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} placeholder="Your reply…" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplying(null)}>Cancel</Button>
            <Button disabled={!reply.trim() || replyM.isPending} onClick={() => replyM.mutate()}>
              {replyM.isPending ? "Sending…" : "Send reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}