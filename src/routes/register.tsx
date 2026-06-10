import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useId, cloneElement, isValidElement } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitRegistration, requestEmailVerification } from "@/lib/registrations.functions";
import { listSchedule } from "@/lib/schedule.functions";
import { toast } from "sonner";
import { Check } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Discovery Outpost Performing Arts Dance" },
      { name: "description", content: "Sign up online for Ballet, Jazz, Tap, or Musical Theater classes at Discovery Outpost. Trial classes available for all ages and skill levels." },
      { property: "og:title", content: "Register for Dance Classes — Discovery Outpost" },
      { property: "og:description", content: "Sign up online for Ballet, Jazz, Tap, or Musical Theater classes. Trial classes available for all ages and skill levels." },
      { property: "og:url", content: "/register" },
    ],
    links: [{ rel: "canonical", href: "/register" }],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    trial: s.trial === true || s.trial === "true",
    class: typeof s.class === "string" ? s.class : undefined,
  }),
  component: RegisterPage,
});

const CLASSES = ["Ballet", "Jazz", "Tap", "Musical Theater"] as const;
const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

function RegisterPage() {
  const { trial, class: preselect } = Route.useSearch();
  const sched = useServerFn(listSchedule);
  const schedule = useQuery({ queryKey: ["schedule"], queryFn: () => sched() });
  const submit = useServerFn(submitRegistration);
  const requestCode = useServerFn(requestEmailVerification);

  const [form, setForm] = useState({
    student_name: "",
    parent_name: "",
    email: "",
    phone: "",
    age: "",
    desired_class: (preselect && (CLASSES as readonly string[]).includes(preselect) ? preselect : "Ballet") as (typeof CLASSES)[number],
    experience_level: "Beginner" as (typeof LEVELS)[number],
    emergency_contact: "",
    medical_notes: "",
    is_trial: !!trial,
    selected_class_id: "",
  });
  const [step, setStep] = useState<"form" | "verify">("form");
  const [code, setCode] = useState("");
  const [codeDelivery, setCodeDelivery] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sendCode = useMutation({
    mutationFn: () => requestCode({ data: { email: form.email } }),
    onSuccess: (res) => {
      setStep("verify");
      setCodeDelivery(res.delivery as string);
      if ((res.delivery as string) === "email") toast.success("Verification code sent to your email");
      else toast.info("Code generated. Email delivery isn't set up yet — contact the studio to verify.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const m = useMutation({
    mutationFn: () =>
      submit({
        data: {
          student_name: form.student_name,
          parent_name: form.parent_name,
          email: form.email,
          phone: form.phone,
          age: Number(form.age),
          desired_class: form.desired_class,
          experience_level: form.experience_level,
          emergency_contact: form.emergency_contact,
          medical_notes: form.medical_notes || null,
          is_trial: form.is_trial,
          verification_code: code,
        },
      }),
    onSuccess: () => { setDone(true); toast.success("Registration submitted!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  if (done) {
    return (
      <Layout>
        <section className="mx-auto max-w-xl px-6 py-24 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-accent flex items-center justify-center">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-4xl mt-6">Thank you!</h1>
          <p className="mt-4 text-muted-foreground">
            Your registration has been received. We'll be in touch shortly with next steps.
          </p>
          <Button asChild className="mt-8 rounded-full"><Link to="/">Back to home</Link></Button>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <span className="text-xs uppercase tracking-[0.25em] text-primary">
          {form.is_trial ? "Book a Trial" : "Online Registration"}
        </span>
        <h1 className="font-display text-4xl sm:text-5xl mt-3">Register for class</h1>
        <p className="mt-3 text-muted-foreground">
          Fill out the form below — a studio team member will follow up by email.
        </p>

        <Card className="mt-10 p-6 sm:p-8">
          {step === "verify" ? (
            <form
              className="space-y-6"
              onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
            >
              <div>
                <h2 className="font-display text-2xl">Verify your email</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {codeDelivery === "email"
                    ? <>We sent a 6-digit code to <strong>{form.email}</strong>. Enter it below to finish.</>
                    : <>A 6-digit code has been generated for <strong>{form.email}</strong>. Email delivery isn't configured yet — please contact the studio to receive your code.</>}
                </p>
              </div>
              <Field label="Verification Code">
                <Input
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em]"
                />
              </Field>
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep("form")}>Back to form</Button>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" disabled={sendCode.isPending} onClick={() => sendCode.mutate()}>
                    {sendCode.isPending ? "Resending..." : "Resend code"}
                  </Button>
                  <Button type="submit" disabled={m.isPending || code.length !== 6} className="rounded-full px-8 h-11">
                    {m.isPending ? "Submitting..." : "Verify & Submit"}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
          <form
            className="space-y-6"
            onSubmit={(e) => { e.preventDefault(); sendCode.mutate(); }}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Student Name">
                <Input required value={form.student_name} onChange={(e) => update("student_name", e.target.value)} />
              </Field>
              <Field label="Student Age">
                <Input required type="number" min={2} max={99} value={form.age} onChange={(e) => update("age", e.target.value)} />
              </Field>
              <Field label="Parent / Guardian Name">
                <Input required value={form.parent_name} onChange={(e) => update("parent_name", e.target.value)} />
              </Field>
              <Field label="Emergency Contact (name + phone)">
                <Input required value={form.emergency_contact} onChange={(e) => update("emergency_contact", e.target.value)} />
              </Field>
              <Field label="Email">
                <Input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input required type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </Field>
              <Field label="Desired Class">
                <Select value={form.desired_class} onValueChange={(v) => update("desired_class", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Experience Level">
                <Select value={form.experience_level} onValueChange={(v) => update("experience_level", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Preferred Class Time (from schedule)">
              <Select value={form.selected_class_id} onValueChange={(v) => update("selected_class_id", v)}>
                <SelectTrigger><SelectValue placeholder="Choose a time slot (optional)" /></SelectTrigger>
                <SelectContent>
                  {(schedule.data ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.day} — {row.class_name} ({row.time})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Medical Notes / Allergies (optional)">
              <Textarea rows={3} value={form.medical_notes} onChange={(e) => update("medical_notes", e.target.value)} />
            </Field>

            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={form.is_trial} onCheckedChange={(v) => update("is_trial", !!v)} />
              This is a trial class request
            </label>

            <Button type="submit" disabled={sendCode.isPending} className="rounded-full px-8 h-11 w-full sm:w-auto">
              {sendCode.isPending ? "Sending code..." : "Continue — Verify Email"}
            </Button>
          </form>
          )}
        </Card>
      </section>
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement<any>, { id })
    : children;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      {child}
    </div>
  );
}