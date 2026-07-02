import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listClassesWithAvailability, submitFullRegistration } from "@/lib/registration-v2.functions";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, Users, GraduationCap, CalendarDays, ClipboardCheck, Mail, DollarSign, CalendarRange, Wallet } from "lucide-react";
import { REGISTRATION_FEE_CENTS, RECITAL_FEE_CENTS, CASH_DISCOUNT_PER_CLASS_CENTS, SEMESTER_MONTHS, centsToUSD } from "@/lib/business";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Discovery Outpost" },
      { name: "description", content: "Create your parent account, enroll your students, and request an invoice." },
      { property: "og:title", content: "Register for Classes — Discovery Outpost" },
      { property: "og:description", content: "Multi-step registration: parent info, students, class selection, invoice request." },
    ],
  }),
  component: RegisterWizard,
});

const WIZARD_STORAGE_KEY = "do-register-wizard-v2";

type StudentDraft = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  grade: string;
  allergies: string;
  medical_notes: string;
  shirt_size: string;
  class_ids: string[];
};

type WizardState = {
  step: 1 | 2 | 3 | 4 | 5;
  parent: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    phone: string;
    address: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
  };
  students: StudentDraft[];
  notes: string;
  tuition_plan: "monthly" | "semester" | null;
  invoice_preference: "monthly" | "semester" | null;
  cash_payment: boolean;
};

const emptyStudent = (): StudentDraft => ({
  first_name: "", last_name: "", date_of_birth: "", grade: "",
  allergies: "", medical_notes: "", shirt_size: "", class_ids: [],
});

const initialState: WizardState = {
  step: 1,
  parent: {
    first_name: "", last_name: "", email: "", password: "", phone: "",
    address: "", emergency_contact_name: "", emergency_contact_phone: "",
  },
  students: [emptyStudent()],
  notes: "",
  tuition_plan: null,
  invoice_preference: null,
  cash_payment: false,
};

function calcAge(dob: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const SHIRT_SIZES = ["YXS","YS","YM","YL","YXL","AS","AM","AL","AXL","AXXL"];
const GRADES = ["Pre-K","K","1","2","3","4","5","6","7","8","9","10","11","12","Adult"];

function RegisterWizard() {
  const navigate = useNavigate();
  const [state, setState] = useState<WizardState>(() => {
    if (typeof window === "undefined") return initialState;
    try {
      const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
      if (raw) return { ...initialState, ...JSON.parse(raw) };
    } catch {}
    return initialState;
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const { password: _pw, ...rest } = state.parent;
      void _pw;
      sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify({ ...state, parent: { ...rest, password: "" } }));
    } catch {}
  }, [state]);

  const classesQuery = useQuery({
    queryKey: ["wizard-classes"],
    queryFn: () => listClassesWithAvailability(),
  });

  const submitFn = useServerFn(submitFullRegistration);

  function setStep(step: WizardState["step"]) { setState((s) => ({ ...s, step })); }
  function updateParent<K extends keyof WizardState["parent"]>(k: K, v: WizardState["parent"][K]) {
    setState((s) => ({ ...s, parent: { ...s.parent, [k]: v } }));
  }
  function updateStudent(i: number, patch: Partial<StudentDraft>) {
    setState((s) => ({ ...s, students: s.students.map((stu, idx) => idx === i ? { ...stu, ...patch } : stu) }));
  }
  function addStudent() { setState((s) => ({ ...s, students: [...s.students, emptyStudent()] })); }
  function removeStudent(i: number) {
    setState((s) => ({ ...s, students: s.students.length > 1 ? s.students.filter((_, idx) => idx !== i) : s.students }));
  }
  function toggleClassForStudent(studentIdx: number, classId: string) {
    setState((s) => ({
      ...s,
      students: s.students.map((stu, idx) => {
        if (idx !== studentIdx) return stu;
        const has = stu.class_ids.includes(classId);
        return { ...stu, class_ids: has ? stu.class_ids.filter((c) => c !== classId) : [...stu.class_ids, classId] };
      }),
    }));
  }

  const step1Valid = useMemo(() => {
    const p = state.parent;
    return p.first_name.trim() && p.last_name.trim()
      && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)
      && p.password.length >= 8
      && p.phone.trim().length >= 7
      && p.address.trim().length > 0
      && p.emergency_contact_name.trim()
      && p.emergency_contact_phone.trim().length >= 7;
  }, [state.parent]);

  const step2Valid = useMemo(() => state.students.every((s) =>
    s.first_name.trim() && s.last_name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.date_of_birth)
  ), [state.students]);

  const step3Valid = useMemo(() => state.students.every((s) => s.class_ids.length > 0), [state.students]);

  const step4Valid = useMemo(
    () => state.tuition_plan !== null && state.invoice_preference !== null,
    [state.tuition_plan, state.invoice_preference],
  );

  const totals = useMemo(() => {
    if (!classesQuery.data) return { monthly: 0, semester: 0, count: 0 };
    const map = new Map(classesQuery.data.map((c) => [c.id, c]));
    let monthly = 0, semester = 0, count = 0;
    for (const s of state.students) {
      for (const id of s.class_ids) {
        const c = map.get(id);
        if (!c) continue;
        monthly += c.monthly_tuition_cents ?? 0;
        semester += (c as any).semester_tuition_cents ?? (c.monthly_tuition_cents ?? 0) * SEMESTER_MONTHS;
        count++;
      }
    }
    return { monthly, semester, count };
  }, [state.students, classesQuery.data]);

  async function handleSubmitAll() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!state.tuition_plan || !state.invoice_preference) {
        throw new Error("Please choose a tuition plan and invoice preference before submitting.");
      }
      const email = state.parent.email.trim().toLowerCase();
      const password = state.parent.password;
      const { data: existingSession } = await supabase.auth.getSession();
      if (!existingSession.session) {
        const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: `${window.location.origin}/account` },
        });
        if (signUpErr) {
          if (signUpErr.message.toLowerCase().includes("registered")) {
            const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
            if (siErr) throw new Error("An account with this email already exists. Please sign in first, then continue.");
          } else {
            throw signUpErr;
          }
        } else if (!signUp.session) {
          const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
          if (siErr) throw new Error("Account created but could not sign in automatically. Check your email to confirm.");
        }
      }

      const result = await submitFn({
        data: {
          parent: {
            first_name: state.parent.first_name,
            last_name: state.parent.last_name,
            email,
            phone: state.parent.phone,
            address: state.parent.address,
          },
          emergency_contact: {
            name: state.parent.emergency_contact_name,
            phone: state.parent.emergency_contact_phone,
          },
          students: state.students.map((s) => ({
            first_name: s.first_name,
            last_name: s.last_name,
            date_of_birth: s.date_of_birth,
            grade: s.grade || null,
            allergies: s.allergies || null,
            medical_notes: s.medical_notes || null,
            shirt_size: s.shirt_size || null,
            class_ids: s.class_ids,
          })),
          tuition_plan: state.tuition_plan!,
          invoice_preference: state.invoice_preference!,
          cash_payment: state.cash_payment,
          notes: state.notes || null,
        },
      });

      const waitlisted = result.placements.filter((p) => p.placement === "waitlisted").length;
      const enrolled = result.placements.filter((p) => p.placement === "enrolled").length;

      const invNum = (result as any).invoice?.invoiceNumber;
      toast.success(`Registration complete — ${enrolled} enrolled, ${waitlisted} waitlisted.${invNum ? ` Invoice ${invNum} created.` : ""}`);
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      navigate({ to: "/account" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <section className="mx-auto max-w-3xl px-4 py-8 pb-32 sm:py-12">
        <h1 className="font-display text-3xl sm:text-4xl">Register</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your account, enroll your students, and submit an invoice request. The studio
          will email your bill — no payment required to finish registration.
        </p>

        <WizardProgress current={state.step} />

        <Card className="mt-6 p-5 sm:p-7">
          {state.step === 1 && <Step1Parent state={state.parent} update={updateParent} />}
          {state.step === 2 && (
            <Step2Students students={state.students} update={updateStudent} add={addStudent} remove={removeStudent} />
          )}
          {state.step === 3 && (
            <Step3Classes
              students={state.students}
              classes={classesQuery.data ?? []}
              loading={classesQuery.isLoading}
              toggle={toggleClassForStudent}
            />
          )}
          {state.step === 4 && (
            <Step4Billing
              state={state}
              totals={totals}
              setState={setState}
            />
          )}
          {state.step === 5 && (
            <Step4Review
              state={state}
              classes={classesQuery.data ?? []}
              totals={totals}
              setNotes={(v) => setState((s) => ({ ...s, notes: v }))}
            />
          )}
        </Card>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Button
              type="button" variant="outline"
              onClick={() => setStep(Math.max(1, state.step - 1) as WizardState["step"])}
              disabled={state.step === 1 || submitting}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="text-xs text-muted-foreground">Step {state.step} of 5</div>
            {state.step < 5 ? (
              <Button
                type="button"
                onClick={() => setStep((state.step + 1) as WizardState["step"])}
                disabled={
                  (state.step === 1 && !step1Valid) ||
                  (state.step === 2 && !step2Valid) ||
                  (state.step === 3 && !step3Valid) ||
                  (state.step === 4 && !step4Valid)
                }
              >
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmitAll} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit & Generate Invoice"}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account? <Link to="/auth" className="underline">Sign in</Link>
        </p>
      </section>
    </Layout>
  );
}

function WizardProgress({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  const steps = [
    { n: 1, label: "Parent", icon: Users },
    { n: 2, label: "Students", icon: GraduationCap },
    { n: 3, label: "Classes", icon: CalendarDays },
    { n: 4, label: "Billing", icon: DollarSign },
    { n: 5, label: "Review", icon: ClipboardCheck },
  ] as const;
  return (
    <ol className="mt-6 grid grid-cols-5 gap-2 sm:gap-4">
      {steps.map(({ n, label, icon: Icon }) => {
        const active = n === current;
        const done = n < current;
        return (
          <li key={n} className="flex flex-col items-center text-center">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary bg-primary/10 text-primary" : "border-muted text-muted-foreground"}`}>
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span className={`mt-1 text-[11px] sm:text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Step1Parent({
  state, update,
}: { state: WizardState["parent"]; update: <K extends keyof WizardState["parent"]>(k: K, v: WizardState["parent"][K]) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl">Parent Information</h2>
        <p className="text-sm text-muted-foreground">We'll create your account with this email and password.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First Name" required>
          <Input value={state.first_name} onChange={(e) => update("first_name", e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="Last Name" required>
          <Input value={state.last_name} onChange={(e) => update("last_name", e.target.value)} autoComplete="family-name" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={state.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password (min 8 chars)" required>
          <Input type="password" value={state.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Phone" required>
          <Input type="tel" value={state.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" />
        </Field>
        <Field label="Address" required className="sm:col-span-2">
          <Input value={state.address} onChange={(e) => update("address", e.target.value)} autoComplete="street-address" />
        </Field>
      </div>
      <div className="pt-2">
        <h3 className="text-base font-semibold">Emergency Contact</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={state.emergency_contact_name} onChange={(e) => update("emergency_contact_name", e.target.value)} />
          </Field>
          <Field label="Phone" required>
            <Input type="tel" value={state.emergency_contact_phone} onChange={(e) => update("emergency_contact_phone", e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Step2Students({
  students, update, add, remove,
}: {
  students: StudentDraft[];
  update: (i: number, patch: Partial<StudentDraft>) => void;
  add: () => void;
  remove: (i: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl">Student Information</h2>
        <p className="text-sm text-muted-foreground">Add as many students as you'd like to register.</p>
      </div>
      <div className="space-y-4">
        {students.map((s, i) => {
          const age = calcAge(s.date_of_birth);
          return (
            <Card key={i} className="p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Student {i + 1}</h3>
                {students.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="First Name" required>
                  <Input value={s.first_name} onChange={(e) => update(i, { first_name: e.target.value })} />
                </Field>
                <Field label="Last Name" required>
                  <Input value={s.last_name} onChange={(e) => update(i, { last_name: e.target.value })} />
                </Field>
                <Field label="Birthday" required>
                  <Input type="date" value={s.date_of_birth} onChange={(e) => update(i, { date_of_birth: e.target.value })} />
                </Field>
                <Field label="Age (calculated)">
                  <Input value={age == null ? "" : String(age)} disabled placeholder="—" />
                </Field>
                <Field label="Grade">
                  <Select value={s.grade || undefined} onValueChange={(v) => update(i, { grade: v })}>
                    <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Shirt Size">
                  <Select value={s.shirt_size || undefined} onValueChange={(v) => update(i, { shirt_size: v })}>
                    <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                    <SelectContent>
                      {SHIRT_SIZES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Allergies" className="sm:col-span-2">
                  <Textarea rows={2} value={s.allergies} onChange={(e) => update(i, { allergies: e.target.value })} />
                </Field>
                <Field label="Medical Notes" className="sm:col-span-2">
                  <Textarea rows={2} value={s.medical_notes} onChange={(e) => update(i, { medical_notes: e.target.value })} />
                </Field>
              </div>
            </Card>
          );
        })}
      </div>
      <Button type="button" variant="outline" onClick={add}>
        <Plus className="mr-1 h-4 w-4" /> Add Another Student
      </Button>
    </div>
  );
}

type ClassRow = Awaited<ReturnType<typeof listClassesWithAvailability>>[number];

function Step3Classes({
  students, classes, loading, toggle,
}: { students: StudentDraft[]; classes: ClassRow[]; loading: boolean; toggle: (studentIdx: number, classId: string) => void }) {
  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading classes…</p>;
  if (classes.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No classes available yet. Please check back soon.</p>;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Class Selection</h2>
        <p className="text-sm text-muted-foreground">Pick at least one class per student. Full classes will place the student on the waitlist.</p>
      </div>
      {students.map((s, i) => (
        <div key={i}>
          <h3 className="font-semibold">{s.first_name || "Student"} {s.last_name}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3">
            {classes.map((c) => {
              const selected = s.class_ids.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(i, c.id)}
                  className={`text-left rounded-md border p-4 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.class_name}</span>
                        {c.age_group && <Badge variant="secondary">{c.age_group}</Badge>}
                        {c.is_full ? (
                          <Badge variant="destructive">Full — Waitlist</Badge>
                        ) : c.remaining != null ? (
                          <Badge variant="outline">{c.remaining} spot{c.remaining === 1 ? "" : "s"} left</Badge>
                        ) : null}
                      </div>
                      {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.day} · {c.time}
                        {c.instructor ? ` · ${c.instructor}` : ""}
                      </p>
                      {c.monthly_tuition_cents != null && (
                        <p className="mt-1 text-sm font-medium">${(c.monthly_tuition_cents / 100).toFixed(2)}/mo</p>
                      )}
                    </div>
                    <div aria-hidden className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Step4Review({
  state, classes, totals, setNotes,
}: { state: WizardState; classes: ClassRow[]; totals: { monthly: number; semester: number; count: number }; setNotes: (v: string) => void }) {
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const cashDiscount = state.cash_payment ? CASH_DISCOUNT_PER_CLASS_CENTS * totals.count : 0;
  const feesPerStudent = REGISTRATION_FEE_CENTS + RECITAL_FEE_CENTS;
  const totalFees = feesPerStudent * state.students.length;
  const tuitionTotal = state.tuition_plan === "semester"
    ? totals.semester
    : (state.invoice_preference === "semester" ? totals.monthly * SEMESTER_MONTHS : totals.monthly);
  const totalDue = tuitionTotal + totalFees - cashDiscount;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Review &amp; Submit</h2>
        <p className="text-sm text-muted-foreground">Confirm everything looks right, then submit. An invoice will be generated automatically.</p>
      </div>

      <section>
        <h3 className="font-semibold">Parent</h3>
        <p className="text-sm">{state.parent.first_name} {state.parent.last_name} · {state.parent.email}</p>
        <p className="text-sm text-muted-foreground">{state.parent.phone} · {state.parent.address}</p>
        <p className="mt-1 text-sm text-muted-foreground">Emergency: {state.parent.emergency_contact_name} ({state.parent.emergency_contact_phone})</p>
      </section>

      <section>
        <h3 className="font-semibold">Students &amp; Classes</h3>
        <div className="mt-2 space-y-3">
          {state.students.map((s, i) => (
            <div key={i} className="rounded-md border p-3">
              <p className="font-medium">{s.first_name} {s.last_name} <span className="text-xs text-muted-foreground">· DOB {s.date_of_birth}{s.grade ? ` · Grade ${s.grade}` : ""}</span></p>
              <ul className="mt-1 text-sm">
                {s.class_ids.map((id) => {
                  const c = classMap.get(id);
                  if (!c) return null;
                  return (
                    <li key={id} className="flex justify-between">
                      <span>{c.class_name} — {c.day} {c.time}{c.is_full ? " (waitlist)" : ""}</span>
                      <span className="text-muted-foreground">{c.monthly_tuition_cents != null ? `$${(c.monthly_tuition_cents/100).toFixed(2)}/mo` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border bg-muted/30 p-4">
        <div className="flex justify-between text-sm">
          <span>Tuition Plan</span>
          <span className="font-medium">{state.tuition_plan === "monthly" ? "Monthly" : "Semester (one payment)"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Invoice Preference</span>
          <span className="font-medium">{state.invoice_preference === "monthly" ? "Monthly invoices" : "One semester invoice"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Cash payment</span>
          <span className="font-medium">{state.cash_payment ? "Yes (Pay Cash at the Studio)" : "No"}</span>
        </div>
        <div className="mt-2 border-t pt-2 flex justify-between text-sm">
          <span>Tuition ({state.tuition_plan === "semester" || state.invoice_preference === "semester" ? "semester total" : "per month"})</span>
          <span>{centsToUSD(tuitionTotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Registration + Recital fees ({state.students.length} student{state.students.length === 1 ? "" : "s"})</span>
          <span>{centsToUSD(totalFees)}</span>
        </div>
        {cashDiscount > 0 && (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>Cash discount ($5 × {totals.count} class{totals.count === 1 ? "" : "es"})</span>
            <span>−{centsToUSD(cashDiscount)}</span>
          </div>
        )}
        <div className="mt-2 border-t pt-2 flex justify-between font-semibold">
          <span>Estimated total due</span>
          <span>{centsToUSD(totalDue)}</span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Registration fees only apply if this student hasn't been charged yet this semester. The studio confirms final amounts.
        </p>
      </section>

      <section className="rounded-md border p-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Notes for the studio</h3>
        </div>
        <div className="mt-3">
          <Label className="text-sm">Anything the studio should know? (optional)</Label>
          <Textarea
            className="mt-1"
            rows={3}
            value={state.notes}
            placeholder="Questions, notes, special circumstances…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </section>
    </div>
  );
}

function Step4Billing({
  state, totals, setState,
}: {
  state: WizardState;
  totals: { monthly: number; semester: number; count: number };
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Billing Preferences</h2>
        <p className="text-sm text-muted-foreground">Choose how you'd like to be billed. You can change this later by contacting the studio.</p>
      </div>

      <div>
        <Label className="text-sm font-semibold">Tuition Plan</Label>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <PlanCard
            selected={state.tuition_plan === "monthly"}
            onClick={() => setState((s) => ({ ...s, tuition_plan: "monthly" }))}
            title="Monthly Tuition"
            price={`${centsToUSD(totals.monthly)}/mo × ${SEMESTER_MONTHS}`}
            desc={`Billed once per month for ${SEMESTER_MONTHS} months.`}
          />
          <PlanCard
            selected={state.tuition_plan === "semester"}
            onClick={() => setState((s) => ({ ...s, tuition_plan: "semester" }))}
            title="Semester Tuition"
            price={centsToUSD(totals.semester)}
            desc={`One payment covering the full ${SEMESTER_MONTHS}-month semester.`}
          />
        </div>
      </div>

      <div>
        <Label className="text-sm font-semibold">Invoice Preference</Label>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <PlanCard
            selected={state.invoice_preference === "monthly"}
            onClick={() => setState((s) => ({ ...s, invoice_preference: "monthly" }))}
            title="Monthly Invoices"
            price=""
            desc="Receive a separate invoice each month."
          />
          <PlanCard
            selected={state.invoice_preference === "semester"}
            onClick={() => setState((s) => ({ ...s, invoice_preference: "semester" }))}
            title="One Semester Invoice"
            price=""
            desc="Receive one combined invoice for the whole semester."
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-md border p-4 cursor-pointer hover:bg-muted/30">
        <input
          type="checkbox"
          className="mt-1"
          checked={state.cash_payment}
          onChange={(e) => setState((s) => ({ ...s, cash_payment: e.target.checked }))}
        />
        <div>
          <p className="font-semibold text-sm">Pay Cash at the Studio</p>
          <p className="text-xs text-muted-foreground">
            Get a ${(CASH_DISCOUNT_PER_CLASS_CENTS / 100).toFixed(2)} discount per enrolled class. Your invoice will be marked "Payment Pending – Cash" until received.
          </p>
          {state.cash_payment && totals.count > 0 && (
            <p className="text-xs text-emerald-700 mt-1">
              You'll save {centsToUSD(CASH_DISCOUNT_PER_CLASS_CENTS * totals.count)}.
            </p>
          )}
        </div>
      </label>
    </div>
  );
}

function PlanCard({ selected, onClick, title, price, desc }: { selected: boolean; onClick: () => void; title: string; price: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} className={`text-left rounded-md border p-4 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <div className={`h-4 w-4 rounded-full border ${selected ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
      </div>
      {price && <p className="mt-1 font-display text-lg">{price}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-sm">{label}{required && <span className="text-destructive"> *</span>}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}