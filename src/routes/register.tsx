import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { submitRegistration } from "@/lib/registrations.functions";
import { listSchedule } from "@/lib/schedule.functions";
import { listTuitionItems } from "@/lib/tuition.functions";
import { createCartCheckoutSession } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import {
  getSeasonInfo,
  proratedSemesterCents,
  SEASON_TOTAL_MONTHS,
} from "@/lib/season";
import { toast } from "sonner";
import { Check, ChevronLeft, CreditCard, FileText, DollarSign } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Discovery Outpost Performing Arts Dance" },
      { name: "description", content: "Enroll online in Ballet, Jazz, Tap, or Musical Theatre classes at Discovery Outpost. Sign waivers and pay securely in one flow." },
      { property: "og:title", content: "Register for Dance Classes — Discovery Outpost" },
      { property: "og:description", content: "Enroll online and pay securely. Trial classes available for all ages and skill levels." },
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

const PROGRAMS = [
  { id: "Dance", label: "Dance", desc: "Ballet, Jazz, Tap" },
  { id: "Musical Theater", label: "Musical Theatre", desc: "Performance + dance" },
] as const;
type ProgramId = (typeof PROGRAMS)[number]["id"];

type TuitionRow = {
  id: string;
  kind: string;
  name: string;
  display_price: string;
  stripe_price_id: string;
  description?: string;
  active: boolean;
};

type ScheduleRow = {
  id: string;
  day: string;
  class_name: string;
  time: string;
};

type ClassChoice = {
  baseName: string;
  monthly?: TuitionRow;
  semester?: TuitionRow;
  scheduleMatches: ScheduleRow[];
};

function priceToCents(display: string): number {
  const m = display.match(/\$([\d.,]+)/);
  if (!m) return 0;
  return Math.round(parseFloat(m[1].replace(/,/g, "")) * 100);
}

function programOf(name: string): ProgramId {
  if (/musical theater/i.test(name)) return "Musical Theater";
  return "Dance";
}

function classKey(scheduleClassName: string): string {
  // Try to pull the age range "(Ages X–Y)" or the leading words before "Class"
  const ages = scheduleClassName.match(/\(Ages[^)]+\)/i);
  return ages ? ages[0].toLowerCase() : scheduleClassName.toLowerCase();
}

function RegisterPage() {
  const { trial } = Route.useSearch();
  const sched = useServerFn(listSchedule);
  const tuition = useServerFn(listTuitionItems);
  const schedule = useQuery({ queryKey: ["schedule"], queryFn: () => sched() });
  const tuitionQ = useQuery({ queryKey: ["tuition"], queryFn: () => tuition() });
  const submit = useServerFn(submitRegistration);
  const startCheckout = useServerFn(createCartCheckoutSession);

  const [step, setStep] = useState(1);
  const [program, setProgram] = useState<ProgramId | "">("");
  const [choice, setChoice] = useState<ClassChoice | null>(null);
  const [plan, setPlan] = useState<"monthly" | "semester">("monthly");
  const [scheduleId, setScheduleId] = useState<string>("");
  const [waiver, setWaiver] = useState({ liability: false, media: false, parent: false, signature: "" });
  const [form, setForm] = useState({
    student_name: "",
    date_of_birth: "",
    parent_name: "",
    email: "",
    phone: "",
    age: "",
    experience_level: "Beginner" as "Beginner" | "Intermediate" | "Advanced",
    emergency_contact: "",
    medical_notes: "",
  });
  const [done, setDone] = useState<null | { mode: "card" | "cash" | "invoice"; id: string | null }>(null);
  const [submitting, setSubmitting] = useState<null | "card" | "cash" | "invoice">(null);

  // Group tuition items into one class entry with optional monthly + semester
  const classChoices: ClassChoice[] = useMemo(() => {
    if (!tuitionQ.data) return [];
    const items = (tuitionQ.data as TuitionRow[]).filter(
      (i) => i.active && (i.kind === "class_monthly" || i.kind === "class_semester"),
    );
    const byName = new Map<string, ClassChoice>();
    for (const item of items) {
      const cur = byName.get(item.name) ?? { baseName: item.name, scheduleMatches: [] };
      if (item.kind === "class_monthly") cur.monthly = item;
      else if (item.kind === "class_semester") cur.semester = item;
      byName.set(item.name, cur);
    }
    const sched = (schedule.data ?? []) as ScheduleRow[];
    for (const c of byName.values()) {
      const key = classKey(c.baseName);
      c.scheduleMatches = sched.filter((s) => classKey(s.class_name) === key || s.class_name.toLowerCase().includes(key));
    }
    return Array.from(byName.values()).filter((c) => !program || programOf(c.baseName) === program);
  }, [tuitionQ.data, schedule.data, program]);

  const selectedItem = choice
    ? plan === "monthly" ? choice.monthly : choice.semester
    : undefined;

  const season = useMemo(() => getSeasonInfo(), []);
  const semesterCents = choice?.semester ? priceToCents(choice.semester.display_price) : 0;
  const proratedCents = semesterCents > 0
    ? proratedSemesterCents(semesterCents, season.monthsRemaining)
    : 0;

  function canAdvance(): boolean {
    if (step === 1) return !!program;
    if (step === 2) return !!choice && !!selectedItem;
    if (step === 3)
      return !!form.student_name && !!form.parent_name && !!form.email
        && !!form.phone && !!form.age && !!form.emergency_contact;
    if (step === 4)
      return waiver.liability && waiver.media && waiver.parent && waiver.signature.trim().length >= 2;
    return true;
  }

  async function submitWithChoice(mode: "card" | "cash" | "invoice") {
    if (!choice || !selectedItem) return;
    setSubmitting(mode);
    try {
      const result = await submit({
        data: {
          student_name: form.student_name,
          parent_name: form.parent_name,
          email: form.email,
          phone: form.phone,
          age: Number(form.age),
          desired_class: (program === "Musical Theater" ? "Musical Theater" : "Ballet") as
            "Ballet" | "Musical Theater",
          experience_level: form.experience_level,
          emergency_contact: form.emergency_contact,
          medical_notes: form.medical_notes || null,
          is_trial: !!trial,
          program,
          selected_class_id: scheduleId || null,
          tuition_item_id: selectedItem.id,
          payment_choice: mode,
          waiver_signature: waiver.signature,
          media_release: waiver.media,
          parent_agreement: waiver.parent,
          date_of_birth: form.date_of_birth || null,
        },
      });
      const regId = (result && typeof result === "object" && "id" in result ? (result as any).id : null) as string | null;

      if (mode === "card") {
        const includeRegFee = true; // $10 season registration fee
        const items = [{ priceId: selectedItem.stripe_price_id, quantity: 1 }];
        if (includeRegFee) items.push({ priceId: "do_registration_fee", quantity: 1 });
        const res = await startCheckout({
          data: {
            items,
            customerEmail: form.email,
            returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
            environment: getStripeEnvironment(),
            paymentPlan: plan === "semester" ? "semester" : "auto_pay",
          },
        });
        if ("error" in res) throw new Error(res.error);
        window.location.href = (res as { url: string }).url;
        return;
      }
      setDone({ mode, id: regId });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  if (done) {
    return (
      <Layout>
        <section className="mx-auto max-w-xl px-6 py-24 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-accent flex items-center justify-center">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-4xl mt-6">Registration received!</h1>
          {done.mode === "cash" && (
            <p className="mt-4 text-muted-foreground">
              You're registered as a <span className="font-semibold text-foreground">cash payer</span>.
              Bring tuition in cash to your first class — you'll save $5 off each payment.
              We'll follow up by email shortly.
            </p>
          )}
          {done.mode === "invoice" && (
            <p className="mt-4 text-muted-foreground">
              Your invoice request is in. A studio admin will send an itemized invoice to{" "}
              <span className="font-semibold text-foreground">{form.email}</span> within 1 business day.
              Your student is held in the class pending payment.
            </p>
          )}
          <Button asChild className="mt-8 rounded-full"><Link to="/">Back to home</Link></Button>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <PaymentTestModeBanner />
      <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <span className="text-xs uppercase tracking-[0.25em] text-primary">
          {trial ? "Book a Trial Class" : "Online Enrollment"}
        </span>
        <h1 className="font-display text-4xl sm:text-5xl mt-3">Register your student</h1>
        <Stepper step={step} />

        <Card className="mt-6 p-6 sm:p-8">
          {step === 1 && (
            <StepBlock title="Choose a program" subtitle="Pick what your student wants to take.">
              <div className="grid sm:grid-cols-2 gap-3">
                {PROGRAMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProgram(p.id)}
                    className={`text-left rounded-2xl border p-5 transition ${
                      program === p.id ? "border-primary bg-accent/40" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-display text-xl">{p.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">{p.desc}</div>
                  </button>
                ))}
              </div>
            </StepBlock>
          )}

          {step === 2 && (
            <StepBlock title="Choose a class & plan" subtitle="Pick the age-appropriate class. You can pay monthly or for the full Aug–Nov semester.">
              {tuitionQ.isLoading && <p className="text-sm text-muted-foreground">Loading classes…</p>}
              <div className="space-y-3">
                {classChoices.map((c) => {
                  const active = choice?.baseName === c.baseName;
                  return (
                    <div key={c.baseName} className={`rounded-2xl border p-4 ${active ? "border-primary" : "border-border"}`}>
                      <button
                        onClick={() => { setChoice(c); setScheduleId(c.scheduleMatches[0]?.id ?? ""); }}
                        className="w-full text-left flex items-start justify-between gap-4"
                      >
                        <div>
                          <div className="font-semibold">{c.baseName}</div>
                          {c.scheduleMatches.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {c.scheduleMatches.map((s) => `${s.day} ${s.time}`).join(" · ")}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          {c.monthly && <div>{c.monthly.display_price}</div>}
                          {c.semester && <div className="text-muted-foreground">{c.semester.display_price} semester</div>}
                        </div>
                      </button>
                      {active && (
                        <div className="mt-4 pt-4 border-t space-y-3">
                          <RadioGroup value={plan} onValueChange={(v) => setPlan(v as "monthly" | "semester")} className="grid sm:grid-cols-2 gap-2">
                            {c.monthly && (
                              <PlanOption value="monthly" label="Monthly auto-pay" detail={`${c.monthly.display_price} · charged Aug–Nov`} />
                            )}
                            {c.semester && (
                              <PlanOption
                                value="semester"
                                label="Pay full semester"
                                detail={
                                  season.monthsRemaining > 0 && season.monthsRemaining < SEASON_TOTAL_MONTHS
                                    ? `Prorated $${(proratedCents / 100).toFixed(2)} (${season.monthsRemaining}/${SEASON_TOTAL_MONTHS} mo)`
                                    : `${c.semester.display_price} one-time`
                                }
                              />
                            )}
                          </RadioGroup>
                          {c.scheduleMatches.length > 1 && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">Preferred time</Label>
                              <select
                                className="w-full rounded-md border bg-background p-2 text-sm"
                                value={scheduleId}
                                onChange={(e) => setScheduleId(e.target.value)}
                              >
                                {c.scheduleMatches.map((s) => (
                                  <option key={s.id} value={s.id}>{s.day} — {s.time}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!tuitionQ.isLoading && classChoices.length === 0 && (
                  <p className="text-sm text-muted-foreground">No active classes for this program yet.</p>
                )}
              </div>
            </StepBlock>
          )}

          {step === 3 && (
            <StepBlock title="Student information" subtitle="Who's enrolling, and how do we reach you?">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Student name">
                  <Input value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} />
                </Field>
                <Field label="Date of birth">
                  <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                </Field>
                <Field label="Student age">
                  <Input type="number" min={2} max={99} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                </Field>
                <Field label="Experience level">
                  <select className="w-full rounded-md border bg-background p-2 text-sm"
                    value={form.experience_level}
                    onChange={(e) => setForm({ ...form, experience_level: e.target.value as any })}>
                    {["Beginner", "Intermediate", "Advanced"].map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Parent / guardian name">
                  <Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
                </Field>
                <Field label="Emergency contact (name + phone)">
                  <Input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
              </div>
              <Field label="Medical notes / allergies (optional)">
                <Textarea rows={3} value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} />
              </Field>
            </StepBlock>
          )}

          {step === 4 && (
            <StepBlock title="Waivers & agreements" subtitle="Required for participation.">
              <WaiverBox title="Liability Waiver">
                I understand dance involves physical activity with inherent risk of injury, and I release
                Discovery Outpost Performing Arts, its instructors and staff from liability for injuries
                sustained during classes, rehearsals, or performances.
              </WaiverBox>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={waiver.liability} onCheckedChange={(v) => setWaiver({ ...waiver, liability: !!v })} />
                <span>I agree to the liability waiver above.</span>
              </label>

              <WaiverBox title="Media Release">
                I grant Discovery Outpost permission to use photos and video of my student in studio
                promotional materials (social media, website, recital programs).
              </WaiverBox>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={waiver.media} onCheckedChange={(v) => setWaiver({ ...waiver, media: !!v })} />
                <span>I agree to the media release.</span>
              </label>

              <WaiverBox title="Parent Agreement">
                I will pay tuition on time, follow studio attendance and dress-code policies, and notify
                staff of any changes affecting my student's participation.
              </WaiverBox>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={waiver.parent} onCheckedChange={(v) => setWaiver({ ...waiver, parent: !!v })} />
                <span>I agree to the parent agreement.</span>
              </label>

              <Field label="Type your full name as electronic signature">
                <Input value={waiver.signature} onChange={(e) => setWaiver({ ...waiver, signature: e.target.value })} placeholder="Parent / guardian full name" />
              </Field>
            </StepBlock>
          )}

          {step === 5 && (
            <StepBlock title="How would you like to pay?" subtitle="Choose now, change later from your account.">
              <Summary
                program={program}
                className={choice?.baseName ?? ""}
                plan={plan}
                price={selectedItem?.display_price ?? ""}
                proratedNote={
                  plan === "semester" && proratedCents > 0
                  && proratedCents !== semesterCents
                    ? `Prorated to $${(proratedCents / 100).toFixed(2)} (${season.monthsRemaining}/${SEASON_TOTAL_MONTHS} months)`
                    : null
                }
              />
              <div className="grid gap-3 mt-4">
                <PayOption
                  icon={<CreditCard className="h-5 w-5" />}
                  title="Register & Pay Now"
                  detail="Visa, Mastercard, Amex, Apple Pay, Google Pay. Instant enrollment + email receipt."
                  primary
                  loading={submitting === "card"}
                  onClick={() => submitWithChoice("card")}
                />
                <PayOption
                  icon={<DollarSign className="h-5 w-5" />}
                  title="Pay Cash at Studio"
                  detail="Bring tuition in cash to first class — save $5 each payment."
                  loading={submitting === "cash"}
                  onClick={() => submitWithChoice("cash")}
                />
                <PayOption
                  icon={<FileText className="h-5 w-5" />}
                  title="Request an Invoice"
                  detail="Studio admin sends an itemized invoice to your email. Enrollment held pending payment."
                  loading={submitting === "invoice"}
                  onClick={() => submitWithChoice("invoice")}
                />
              </div>
            </StepBlock>
          )}

          {step < 5 && (
            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" disabled={step === 1} onClick={() => setStep(step - 1)} className="rounded-full">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button disabled={!canAdvance()} onClick={() => setStep(step + 1)} className="rounded-full px-8">
                Continue
              </Button>
            </div>
          )}
          {step === 5 && (
            <div className="mt-6">
              <Button variant="ghost" onClick={() => setStep(4)} className="rounded-full">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            </div>
          )}
        </Card>
      </section>
    </Layout>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Program", "Class", "Student", "Waivers", "Payment"];
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <li key={s} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            active ? "border-primary bg-accent/40 text-foreground" :
            done ? "border-primary/50 text-primary" : "border-border text-muted-foreground"
          }`}>
            <span className="font-mono">{n}</span> {s}
          </li>
        );
      })}
    </ol>
  );
}

function StepBlock({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
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

function WaiverBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="font-semibold text-sm">{title}</div>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{children}</p>
    </div>
  );
}

function PlanOption({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer hover:border-primary/60">
      <RadioGroupItem value={value} className="mt-0.5" />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </label>
  );
}

function PayOption({
  icon, title, detail, primary, loading, onClick,
}: {
  icon: React.ReactNode; title: string; detail: string;
  primary?: boolean; loading?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`text-left rounded-2xl border p-4 sm:p-5 flex items-start gap-4 transition disabled:opacity-60 ${
        primary ? "border-primary bg-primary/5 hover:bg-primary/10" : "hover:border-primary/50"
      }`}
    >
      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
        primary ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"
      }`}>{icon}</div>
      <div>
        <div className="font-semibold">{loading ? "Submitting…" : title}</div>
        <div className="text-xs text-muted-foreground mt-1">{detail}</div>
      </div>
    </button>
  );
}

function Summary({ program, className, plan, price, proratedNote }: {
  program: string; className: string; plan: string; price: string; proratedNote: string | null;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 text-sm">
      <div className="flex justify-between"><span className="text-muted-foreground">Program</span><span className="font-medium">{program}</span></div>
      <div className="flex justify-between mt-1"><span className="text-muted-foreground">Class</span><span className="font-medium">{className}</span></div>
      <div className="flex justify-between mt-1"><span className="text-muted-foreground">Plan</span><span className="font-medium capitalize">{plan}</span></div>
      <div className="flex justify-between mt-1"><span className="text-muted-foreground">Price</span><span className="font-medium">{price}</span></div>
      {proratedNote && <div className="text-xs text-primary mt-2">{proratedNote}</div>}
      <div className="text-xs text-muted-foreground mt-2">+ $10 season registration fee (added at checkout for card payers)</div>
    </div>
  );
}