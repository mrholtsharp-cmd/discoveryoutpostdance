import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listMyThreads, listThreadMessages, createThread, postMessage } from "@/lib/messaging.functions";
import { MessageCircle, Send, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Messages — Discovery Outpost" }, { name: "robots", content: "noindex" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyThreads);
  const msgsFn = useServerFn(listThreadMessages);
  const createFn = useServerFn(createThread);
  const postFn = useServerFn(postMessage);

  const threads = useQuery({ queryKey: ["my-threads"], queryFn: () => listFn() });
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");

  const msgs = useQuery({
    queryKey: ["thread-msgs", openId],
    queryFn: () => msgsFn({ data: { thread_id: openId! } }),
    enabled: !!openId,
  });

  const createM = useMutation({
    mutationFn: async () => {
      const r = await createFn({ data: { subject, body } });
      if ("error" in r) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      toast.success("Message sent");
      setSubject(""); setBody(""); setComposing(false);
      qc.invalidateQueries({ queryKey: ["my-threads"] });
      if ("thread_id" in r) setOpenId(r.thread_id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postM = useMutation({
    mutationFn: async () => {
      const r = await postFn({ data: { thread_id: openId!, body: reply } });
      if ("error" in r) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["thread-msgs", openId] });
      qc.invalidateQueries({ queryKey: ["my-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openThread = threads.data?.find((t) => t.id === openId);

  return (
    <Layout>
      <section className="mx-auto max-w-4xl px-4 py-8 sm:py-12 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <Link to="/account" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Back to portal
            </Link>
            <h1 className="font-display text-3xl mt-2">Messages</h1>
          </div>
          {!composing && !openId && (
            <Button onClick={() => setComposing(true)} className="rounded-full">
              <MessageCircle className="h-4 w-4" /> New message
            </Button>
          )}
        </header>

        {composing && (
          <Card className="p-5 space-y-3">
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            <Textarea placeholder="Write your message…" rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setComposing(false)}>Cancel</Button>
              <Button onClick={() => createM.mutate()} disabled={!subject.trim() || !body.trim() || createM.isPending}>
                {createM.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          </Card>
        )}

        {openId ? (
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg">{openThread?.subject}</h2>
                <Badge variant="outline" className="mt-1">{openThread?.status}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>Back</Button>
            </div>
            <div className="mt-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {(msgs.data ?? []).map((m) => (
                <div key={m.id} className={`rounded-md p-3 text-sm ${m.sender_type === "parent" ? "bg-muted" : "bg-primary/10"}`}>
                  <p className="text-xs text-muted-foreground mb-1">
                    <strong>{m.sender_name}</strong> · {new Date(m.created_at).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <Textarea placeholder="Reply…" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={5000} />
              <div className="flex justify-end">
                <Button onClick={() => postM.mutate()} disabled={!reply.trim() || postM.isPending}>
                  <Send className="h-4 w-4" /> {postM.isPending ? "Sending…" : "Send reply"}
                </Button>
              </div>
            </div>
          </Card>
        ) : threads.isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : (threads.data ?? []).length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No messages yet. Start a conversation with the studio anytime.
          </Card>
        ) : (
          <div className="space-y-2">
            {(threads.data ?? []).map((t) => (
              <button key={t.id} onClick={() => setOpenId(t.id)} className="w-full text-left">
                <Card className="p-4 hover:bg-muted/40 transition">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Last activity {new Date(t.last_message_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={t.status === "resolved" ? "outline" : "secondary"} className="shrink-0 h-fit">{t.status}</Badge>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}