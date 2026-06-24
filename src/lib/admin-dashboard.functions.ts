import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [regsRes, classesRes, subsRes] = await Promise.all([
      supabaseAdmin.from("registrations").select(
        "id, created_at, approval_status, payment_status, payment_failure_flagged, amount_paid_cents, paid_at, refunded_amount_cents, desired_class, selected_class_id, is_trial, student_name, student_first_name, student_last_name",
      ),
      supabaseAdmin.from("class_schedule").select("id, day, class_name, time, capacity"),
      supabaseAdmin.from("subscriptions").select("status, current_period_end"),
    ]);

    if (regsRes.error) throw new Error(regsRes.error.message);
    if (classesRes.error) throw new Error(classesRes.error.message);

    const regs = regsRes.data ?? [];
    const classes = classesRes.data ?? [];
    const subs = subsRes.data ?? [];

    const totalStudents = regs.length;
    const activeStudents = regs.filter(
      (r) => r.approval_status === "approved" && r.payment_status !== "refunded",
    ).length;
    const newRegistrations30d = regs.filter((r) => r.created_at >= thirtyDaysAgo).length;

    const monthRevenueCents = regs
      .filter((r) => r.paid_at && r.paid_at >= monthStart)
      .reduce((sum, r) => sum + (r.amount_paid_cents ?? 0) - (r.refunded_amount_cents ?? 0), 0);

    const failedPayments = regs.filter((r) => r.payment_failure_flagged).length;

    const outstandingCount = regs.filter(
      (r) =>
        r.approval_status === "approved" &&
        (r.payment_status === "pending" ||
          r.payment_status === "past_due" ||
          r.payment_status === "awaiting_card"),
    ).length;

    const pending = regs.filter((r) => r.approval_status === "pending").length;
    const approved = regs.filter((r) => r.approval_status === "approved").length;
    const waitlisted = regs.filter((r) => r.approval_status === "waitlisted").length;
    const declined = regs.filter((r) => r.approval_status === "declined").length;

    // Per-class enrollment counts (approved + active)
    const classEnrollment = classes.map((c) => {
      const enrolled = regs.filter(
        (r) =>
          (r.selected_class_id === c.id || r.desired_class === c.class_name) &&
          r.approval_status === "approved",
      ).length;
      const waitlist = regs.filter(
        (r) =>
          (r.selected_class_id === c.id || r.desired_class === c.class_name) &&
          r.approval_status === "waitlisted",
      ).length;
      return {
        id: c.id,
        day: c.day,
        class_name: c.class_name,
        time: c.time,
        capacity: c.capacity ?? null,
        enrolled,
        waitlist,
      };
    });

    const activeSubscriptions = subs.filter(
      (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
    ).length;

    return {
      students: { total: totalStudents, active: activeStudents, new30d: newRegistrations30d },
      payments: {
        monthRevenueCents,
        failedPayments,
        outstandingCount,
        activeSubscriptions,
      },
      registrations: { pending, approved, waitlisted, declined },
      classes: classEnrollment,
    };
  });

const approvalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "waitlisted", "declined"]),
  admin_notes: z.string().trim().max(1000).optional().nullable(),
});

export const updateRegistrationApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approvalSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      approval_status: data.status,
      approved_at: data.status === "approved" ? new Date().toISOString() : null,
      approved_by: data.status === "approved" ? context.userId : null,
    };
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    const { error } = await supabaseAdmin.from("registrations").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateRegistrationSchema = z.object({
  id: z.string().uuid(),
  student_name: z.string().trim().min(1).max(100).optional(),
  student_first_name: z.string().trim().max(60).nullable().optional(),
  student_last_name: z.string().trim().max(60).nullable().optional(),
  parent_name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  parent_address: z.string().trim().max(300).nullable().optional(),
  age: z.number().int().min(1).max(120).optional(),
  desired_class: z.string().trim().max(100).optional(),
  experience_level: z.string().trim().max(50).optional(),
  emergency_contact: z.string().trim().min(1).max(200).optional(),
  medical_notes: z.string().trim().max(2000).nullable().optional(),
  selected_class_id: z.string().uuid().nullable().optional(),
  admin_notes: z.string().trim().max(1000).nullable().optional(),
});

export const updateRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateRegistrationSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("registrations").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });