import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { submitRegistration } from "@/lib/registrations.functions";
import { listSchedule } from "@/lib/schedule.functions";
import { toast } from "sonner";
import { Check } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Discovery Outpost Performing Arts Dance" },
      { name: "description", content: "Register online for Tap, Jazz, Ballet, or Musical Theater classes." },
    ],
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
  const [done, setDone] = useState(false);

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
          <form
            className="space-y-6"
            onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
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

            <Button type="submit" disabled={m.isPending} className="rounded-full px-8 h-11 w-full sm:w-auto">
              {m.isPending ? "Submitting..." : "Submit Registration"}
            </Button>
          </form>
        </Card>
      </section>
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}