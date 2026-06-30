import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------
async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
  return true;
}

// Public-ish: lets the admin shell decide whether to redirect non-admins.
export const isCurrentUserAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return !!data;
  });

// ---------- DASHBOARD ----------
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      studentsRes, parentsRes, enrollmentsRes, waitlistRes,
      classesRes, regsRes, subsRes,
    ] = await Promise.all([
      supabaseAdmin.from("students").select("id, parent_id, created_at"),
      supabaseAdmin.from("parents").select("id, created_at"),
      supabaseAdmin.from("enrollments").select("id, class_id, status, enrolled_at, student_id"),
      supabaseAdmin.from("waitlist_entries").select("id, class_id"),
      supabaseAdmin.from("class_schedule").select("id, day, class_name, time, capacity, instructor"),
      supabaseAdmin.from("registrations").select(
        "id, created_at, student_name, parent_name, email, payment_status, amount_paid_cents, paid_at, refunded_amount_cents, payment_failure_flagged, approval_status",
      ),
      supabaseAdmin.from("subscriptions").select("id, status, current_period_end, environment"),
    ]);

    const students = studentsRes.data ?? [];
    const parents = parentsRes.data ?? [];
    const enrollments = enrollmentsRes.data ?? [];
    const waitlist = waitlistRes.data ?? [];
    const classes = classesRes.data ?? [];
    const regs = regsRes.data ?? [];
    const subs = subsRes.data ?? [];

    const activeFamilies = new Set(
      students
        .filter((s) => enrollments.some((e) => e.student_id === s.id && e.status === "active"))
        .map((s) => s.parent_id),
    ).size;

    const monthRevenue = regs
      .filter((r) => r.paid_at && r.paid_at >= monthStart)
      .reduce((sum, r) => sum + (r.amount_paid_cents ?? 0) - (r.refunded_amount_cents ?? 0), 0);

    const outstanding = regs.filter(
      (r) => r.approval_status === "approved" && ["pending", "past_due", "awaiting_card"].includes(r.payment_status ?? ""),
    ).length;

    const failed = regs.filter((r) => r.payment_failure_flagged).length;

    // Upcoming subscription renewals next 30 days
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcoming = subs.filter(
      (s) =>
        ["active", "trialing", "past_due"].includes(s.status ?? "") &&
        s.current_period_end &&
        new Date(s.current_period_end) <= in30 &&
        new Date(s.current_period_end) >= now,
    ).length;

    const enrollmentByClass = classes.map((c) => ({
      id: c.id,
      class_name: c.class_name,
      day: c.day,
      time: c.time,
      capacity: c.capacity,
      enrolled: enrollments.filter((e) => e.class_id === c.id && e.status === "active").length,
      waitlist: waitlist.filter((w) => w.class_id === c.id).length,
    }));

    const recentRegs = regs
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 10);

    return {
      totalStudents: students.length,
      activeFamilies,
      monthRevenueCents: monthRevenue,
      outstandingCount: outstanding,
      failedCount: failed,
      upcomingPaymentsCount: upcoming,
      totalEnrolled: enrollments.filter((e) => e.status === "active").length,
      totalWaitlisted: waitlist.length,
      newParents30d: parents.filter((p) => p.created_at >= thirtyDaysAgo).length,
      newStudents30d: students.filter((s) => s.created_at >= thirtyDaysAgo).length,
      enrollmentByClass,
      recentRegistrations: recentRegs,
    };
  });

// ---------- STUDENTS ----------
export const listStudentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, date_of_birth, grade, allergies, medical_notes, admin_notes, parent_id, created_at, parents(id, first_name, last_name, email, phone)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const studentPatchSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(60).optional(),
  last_name: z.string().trim().min(1).max(60).optional(),
  date_of_birth: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  medical_notes: z.string().nullable().optional(),
  admin_notes: z.string().nullable().optional(),
  parent_id: z.string().uuid().optional(),
});
export const updateStudentAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => studentPatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("students").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Move a student between classes (creates/cancels enrollments)
export const moveStudentToClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      from_class_id: z.string().uuid().nullable(),
      to_class_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.from_class_id) {
      await supabaseAdmin.from("enrollments")
        .update({ status: "cancelled" } as never)
        .eq("student_id", data.student_id).eq("class_id", data.from_class_id).eq("status", "active");
    }
    // Create enrollment if not exists
    const { data: existing } = await supabaseAdmin.from("enrollments")
      .select("id").eq("student_id", data.student_id).eq("class_id", data.to_class_id).maybeSingle();
    if (existing) {
      await supabaseAdmin.from("enrollments").update({ status: "active" } as never).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("enrollments")
        .insert({ student_id: data.student_id, class_id: data.to_class_id, status: "active" } as never);
    }
    return { ok: true };
  });

// ---------- PARENTS ----------
export const listParentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("parents")
      .select("id, first_name, last_name, email, phone, address, admin_notes, created_at, students(id, first_name, last_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateParentAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      first_name: z.string().trim().max(60).optional(),
      last_name: z.string().trim().max(60).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(30).optional(),
      address: z.string().max(300).nullable().optional(),
      admin_notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("parents").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- CLASSES ----------
export const listClassesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("class_schedule")
      .select("*").order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const classSchema = z.object({
  id: z.string().uuid().optional(),
  day: z.string().min(1),
  class_name: z.string().min(1).max(100),
  time: z.string().min(1).max(100),
  capacity: z.number().int().nullable().optional(),
  sort_order: z.number().int().optional(),
  description: z.string().nullable().optional(),
  age_group: z.string().nullable().optional(),
  instructor: z.string().nullable().optional(),
  monthly_tuition_cents: z.number().int().nullable().optional(),
});

export const upsertClassAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => classSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { id, ...patch } = data;
      const { error } = await supabaseAdmin.from("class_schedule").update(patch as never).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("class_schedule").insert(data as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteClassAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("class_schedule").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- PAYMENTS ----------
export const listPaymentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select("id, parent_name, student_name, email, desired_class, amount_paid_cents, paid_at, payment_status, refunded_amount_cents, refunded_at, stripe_charge_id, stripe_payment_intent_id, payment_failure_flagged, last_payment_error, created_at")
      .order("paid_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Issue a refund via Stripe (full or partial)
export const issueRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      registration_id: z.string().uuid(),
      amount_cents: z.number().int().positive().nullable(),
      environment: z.enum(["sandbox", "live"]),
      reason: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    const { data: reg, error } = await supabaseAdmin.from("registrations")
      .select("id, stripe_payment_intent_id, stripe_charge_id, amount_paid_cents, refunded_amount_cents, email")
      .eq("id", data.registration_id).maybeSingle();
    if (error || !reg) return { error: "Registration not found" };
    if (!reg.stripe_payment_intent_id && !reg.stripe_charge_id) {
      return { error: "No Stripe payment recorded for this registration" };
    }
    const stripe = createStripeClient(data.environment);
    try {
      const refundParams: any = {};
      if (reg.stripe_payment_intent_id) refundParams.payment_intent = reg.stripe_payment_intent_id;
      else refundParams.charge = reg.stripe_charge_id;
      if (data.amount_cents) refundParams.amount = data.amount_cents;
      if (data.reason) refundParams.metadata = { admin_reason: data.reason };
      const refund = await stripe.refunds.create(refundParams);
      // Webhook charge.refunded will update DB; also patch immediately for instant feedback.
      const totalRefunded = (reg.refunded_amount_cents ?? 0) + (refund.amount ?? 0);
      const isFull = totalRefunded >= (reg.amount_paid_cents ?? 0);
      await supabaseAdmin.from("registrations").update({
        refunded_amount_cents: totalRefunded,
        refunded_at: new Date().toISOString(),
        payment_status: isFull ? "refunded" : "partially_refunded",
      } as never).eq("id", reg.id);
      return { ok: true, refund_id: refund.id };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

// ---------- SUBSCRIPTIONS ----------
export const listSubscriptionsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs, error } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Join parent info via auth user id
    const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id).filter(Boolean)));
    let parentMap: Record<string, { first_name: string; last_name: string; email: string }> = {};
    if (userIds.length) {
      const { data: parents } = await supabaseAdmin.from("parents")
        .select("auth_user_id, first_name, last_name, email").in("auth_user_id", userIds);
      for (const p of parents ?? []) {
        if (p.auth_user_id) parentMap[p.auth_user_id] = {
          first_name: p.first_name ?? "", last_name: p.last_name ?? "", email: p.email ?? "",
        };
      }
    }
    return (subs ?? []).map((s) => ({ ...s, parent: parentMap[s.user_id] ?? null }));
  });

export const cancelSubscriptionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subscription_id: z.string().uuid(),
      immediate: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    const { data: sub } = await supabaseAdmin.from("subscriptions")
      .select("stripe_subscription_id, environment").eq("id", data.subscription_id).maybeSingle();
    if (!sub) return { error: "Subscription not found" };
    const env = (sub.environment as "sandbox" | "live") ?? "sandbox";
    const stripe = createStripeClient(env);
    try {
      if (data.immediate) {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } else {
        await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
        await supabaseAdmin.from("subscriptions").update({ cancel_at_period_end: true } as never).eq("id", data.subscription_id);
      }
      return { ok: true };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

// ---------- WAITLISTS ----------
export const listWaitlistsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("waitlist_entries")
      .select("id, wait_position, created_at, class_id, student_id, class_schedule(id, class_name, day, time, capacity), students(id, first_name, last_name, parent_id, parents(first_name, last_name, email, phone))")
      .order("class_id", { ascending: true })
      .order("wait_position", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const approveWaitlistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ waitlist_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: w, error } = await supabaseAdmin.from("waitlist_entries")
      .select("id, student_id, class_id").eq("id", data.waitlist_id).maybeSingle();
    if (error || !w) return { error: "Waitlist entry not found" };
    // Create enrollment (or reactivate)
    const { data: existing } = await supabaseAdmin.from("enrollments")
      .select("id").eq("student_id", w.student_id).eq("class_id", w.class_id).maybeSingle();
    if (existing) {
      await supabaseAdmin.from("enrollments").update({ status: "active" } as never).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("enrollments")
        .insert({ student_id: w.student_id, class_id: w.class_id, status: "active" } as never);
    }
    await supabaseAdmin.from("waitlist_entries").delete().eq("id", w.id);
    return { ok: true };
  });

export const removeWaitlistEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ waitlist_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("waitlist_entries").delete().eq("id", data.waitlist_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ATTENDANCE ----------
export const listAttendanceForClass = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ class_id: z.string().uuid(), class_date: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enrolls, error: e1 } = await supabaseAdmin
      .from("enrollments")
      .select("id, status, student_id, students(id, first_name, last_name)")
      .eq("class_id", data.class_id)
      .eq("status", "active");
    if (e1) throw new Error(e1.message);
    const enrollmentIds = (enrolls ?? []).map((e) => e.id);
    const { data: marks } = await supabaseAdmin
      .from("attendance")
      .select("*")
      .in("enrollment_id", enrollmentIds.length ? enrollmentIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("class_date", data.class_date);
    const byEnroll: Record<string, any> = {};
    for (const m of marks ?? []) byEnroll[m.enrollment_id] = m;
    return (enrolls ?? []).map((e) => ({
      enrollment_id: e.id,
      student: e.students,
      mark: byEnroll[e.id] ?? null,
    }));
  });

export const recordAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      enrollment_id: z.string().uuid(),
      class_date: z.string(),
      status: z.enum(["present", "absent", "late", "excused"]),
      notes: z.string().max(500).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("attendance").upsert(
      {
        enrollment_id: data.enrollment_id,
        class_date: data.class_date,
        status: data.status,
        notes: data.notes ?? null,
        recorded_by: context.userId,
      } as never,
      { onConflict: "enrollment_id,class_date" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- TEACHERS (derived from class_schedule.instructor) ----------
export const listTeachersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("class_schedule")
      .select("id, instructor, class_name, day, time").not("instructor", "is", null);
    if (error) throw new Error(error.message);
    const byName: Record<string, { name: string; classes: Array<{ id: string; class_name: string; day: string; time: string }> }> = {};
    for (const c of data ?? []) {
      const name = (c.instructor ?? "").trim();
      if (!name) continue;
      byName[name] ??= { name, classes: [] };
      byName[name].classes.push({ id: c.id, class_name: c.class_name, day: c.day, time: c.time });
    }
    return Object.values(byName).sort((a, b) => a.name.localeCompare(b.name));
  });