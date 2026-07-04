import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listAllThreadsAdmin, listThreadMessages, postMessage, updateThreadStatus, adminResendMessage } from "@/lib/messaging.functions";
import { ArrowLeft, Send, RotateCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  head: () => ({ meta: [{ title: "Messages — Admin" }] }),
  component: AdminMessagesPage,
});

function AdminMessagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllThreadsAdmin);
  const msgsFn = useServerFn(listThreadMessages);
  const postFn = useServerFn(postMessage);
  const statusFn = useServerFn(updateThreadStatus);
  const resendFn = useServerFn(adminResendMessage);
  const threads = useQuery({ queryKey: ["admin-threads"], queryFn: () => listFn() });
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const msgs = useQuery({
    queryKey: ["admin-thread-msgs", openId],
    queryFn: () => msgsFn({ data: { thread_id: openId! } }),
    enabled: !!openId,
  });

  const postM = useMutation({
    mutationFn: async () => {
      const r = await postFn({ data: { thread_id: openId!, body: reply } });
      if ("error" in r) throw new Error(r.error);
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["admin-thread-msgs", openId] });
      qc.invalidateQueries({ queryKey: ["admin-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: async (v: { thread_id: string; status: "open" | "resolved" }) => {
      const r = await statusFn({ data: v });
      if ("error" in r) throw new Error(r.error);
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-threads"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendM = useMutation({
    mutationFn: async (message_id: string) => {
      const r: any = await resendFn({ data: { message_id } });
      if (r?.error) throw new Error(r.error);
      return r;
    },
    onSuccess: (r: any) => { toast.success(`Email ${r?.email_status ?? "sent"}`); qc.invalidateQueries({ queryKey: ["admin-thread-msgs", openId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openThread = threads.data?.find((t) => t.id === openId);

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-4">
      <div>
        <Link to="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to admin
        </Link>
        <h1 className="font-display text-3xl mt-2">Parent Messages</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {(threads.data ?? []).map((t) => (
            <button key={t.id} onClick={() => setOpenId(t.id)} className="w-full text-left">
              <Card className={`p-3 transition ${openId === t.id ? "bg-primary/5 border-primary/40" : "hover:bg-muted/40"}`}>
                <div className="flex justify-between gap-2">
                  <p className="font-medium truncate text-sm">{t.subject}</p>
                  <Badge variant={t.status === "resolved" ? "outline" : "secondary"} className="shrink-0 text-[10px] h-fit">{t.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {t.parent?.first_name ?? ""} {t.parent?.last_name ?? ""} · {t.parent?.email ?? ""}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(t.last_message_at).toLocaleString()}</p>
              </Card>
            </button>
          ))}
          {(threads.data ?? []).length === 0 && !threads.isLoading && (
            <Card className="p-4 text-xs text-muted-foreground text-center">No messages yet.</Card>
          )}
        </div>

        <Card className="p-5 min-h-[400px]">
          {!openThread ? (
            <p className="text-sm text-muted-foreground text-center py-16">Select a thread to view messages.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-display text-lg">{openThread.subject}</h2>
                  <p className="text-xs text-muted-foreground">
                    {openThread.parent?.first_name} {openThread.parent?.last_name} · {openThread.parent?.email}
                  </p>
                </div>
                <div className="flex gap-2">
                  {openThread.status === "open" ? (
                    <Button size="sm" variant="outline" onClick={() => statusM.mutate({ thread_id: openThread.id, status: "resolved" })}>Mark resolved</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => statusM.mutate({ thread_id: openThread.id, status: "open" })}>Reopen</Button>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-3 max-h-[50vh] overflow-y-auto">
                {(msgs.data ?? []).map((m) => (
                  <div key={m.id} className={`rounded-md p-3 text-sm ${m.sender_type === "admin" ? "bg-primary/10" : "bg-muted"}`}>
                    <p className="text-xs text-muted-foreground mb-1">
                      <strong>{m.sender_name}</strong> · {new Date(m.created_at).toLocaleString()}
                      {m.sender_type === "admin" && (m as any).delivery_method && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide">
                          · {(m as any).delivery_method}
                          {(m as any).email_status && ` · email ${(m as any).email_status}`}
                          {(m as any).read_at ? ` · read ${new Date((m as any).read_at).toLocaleDateString()}` : m.sender_type === "admin" ? " · unread" : ""}
                        </span>
                      )}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.sender_type === "admin" && (
                      <div className="mt-2">
                        <Button size="sm" variant="ghost" onClick={() => resendM.mutate(m.id)} disabled={resendM.isPending}>
                          <RotateCw className="h-3 w-3" /> Resend email
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <Textarea rows={3} placeholder="Reply as studio…" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} />
                <div className="flex justify-end">
                  <Button onClick={() => postM.mutate()} disabled={!reply.trim() || postM.isPending}>
                    <Send className="h-4 w-4" /> {postM.isPending ? "Sending…" : "Send reply"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </section>
  );
}