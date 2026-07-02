import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BUSINESS } from "@/lib/business";
import { Phone, Mail, MapPin } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — Discovery Outpost" },
      { name: "description", content: "Questions about classes, tuition, or registration? Contact Discovery Outpost Performing Arts Dance in Lawton, OK." },
      { property: "og:title", content: "Contact Discovery Outpost" },
      { property: "og:description", content: "Get in touch with Discovery Outpost Performing Arts Dance." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function upd<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  const valid =
    form.name.trim().length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) &&
    form.subject.trim().length > 0 &&
    form.message.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Failed to send");
      setDone(true);
      toast.success("Message sent — we'll be in touch soon.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-display text-4xl">Questions? We'd love to hear from you.</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Send us a message and we'll respond as quickly as we can. You can also reach us directly at the numbers below.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-6">
            {done ? (
              <div className="text-center py-8">
                <h2 className="font-display text-xl">Thanks!</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your message was sent to Discovery Outpost. We'll reply by email shortly.
                </p>
                <Button className="mt-6 rounded-full" onClick={() => { setDone(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}>
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Name *</Label>
                    <Input value={form.name} onChange={(e) => upd("name", e.target.value)} maxLength={120} />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} maxLength={255} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input type="tel" value={form.phone} onChange={(e) => upd("phone", e.target.value)} maxLength={30} />
                  </div>
                  <div>
                    <Label>Subject *</Label>
                    <Input value={form.subject} onChange={(e) => upd("subject", e.target.value)} maxLength={200} />
                  </div>
                </div>
                <div>
                  <Label>Message *</Label>
                  <Textarea rows={6} value={form.message} onChange={(e) => upd("message", e.target.value)} maxLength={5000} />
                </div>
                <Button type="submit" className="rounded-full" disabled={!valid || submitting}>
                  {submitting ? "Sending…" : "Send message"}
                </Button>
              </form>
            )}
          </Card>

          <Card className="p-6 h-fit">
            <h2 className="font-display text-lg">{BUSINESS.name}</h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" /><span>{BUSINESS.addressLine1}<br />{BUSINESS.addressLine2}</span></p>
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /><a href={`tel:${BUSINESS.phone}`} className="hover:underline">{BUSINESS.phone}</a></p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><a href={`mailto:${BUSINESS.email}`} className="hover:underline break-all">{BUSINESS.email}</a></p>
            </div>
          </Card>
        </div>
      </section>
    </Layout>
  );
}