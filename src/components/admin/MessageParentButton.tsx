import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { adminSendMessageToParent } from "@/lib/messaging.functions";

interface Props {
  parentId: string | null | undefined;
  parentName?: string | null;
  defaultSubject?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
  label?: string;
}

export function MessageParentButton({ parentId, parentName, defaultSubject, size = "sm", variant = "outline", label = "Message Parent" }: Props) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState("");
  const [delivery, setDelivery] = useState<"both" | "portal" | "email">("both");
  const [sending, setSending] = useState(false);
  const sendFn = useServerFn(adminSendMessageToParent);

  async function submit() {
    if (!parentId) return;
    if (!subject.trim() || !body.trim()) { toast.error("Subject and message required"); return; }
    setSending(true);
    try {
      const r: any = await sendFn({ data: { parent_id: parentId, subject: subject.trim(), body: body.trim(), delivery } });
      if (r?.error) { toast.error(r.error); return; }
      const emailNote = delivery === "portal" ? "" : r?.email_status === "sent" ? " · email sent" : r?.email_status === "failed" ? " · email failed (saved in portal)" : "";
      toast.success(`Message sent${emailNote}`);
      setOpen(false); setSubject(defaultSubject ?? ""); setBody("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally { setSending(false); }
  }

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} disabled={!parentId} type="button">
        <MessageSquare className="h-4 w-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Message {parentName || "parent"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Subject" />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder="Write your message…" />
            </div>
            <div>
              <Label className="text-xs">Delivery</Label>
              <RadioGroup value={delivery} onValueChange={(v) => setDelivery(v as any)} className="mt-1 grid grid-cols-1 gap-1">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="both" /> Send Both (Email + Portal)</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="email" /> Send Email only</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="portal" /> Send Parent Portal Message only</label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} type="button">Cancel</Button>
            <Button onClick={submit} disabled={sending} type="button">
              <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}