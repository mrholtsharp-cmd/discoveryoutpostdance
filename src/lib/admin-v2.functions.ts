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

export const isCurrentUserAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    console.log("[isCurrentUserAdmin]", { userId: context.userId, data, error });
    return !!data;
  });

// ---------- DASHBOARD ----------
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [studentsRes, parentsRes, enrollmentsRes, waitlistRes, classesRes, regsRes, invRes] = await Promise.all([
      supabaseAdmin.from("students").select("id, parent_id, created_at"),
      supabaseAdmin.from("parents").select("id, created_at"),
      supabaseAdmin.from("enrollments").select("id, class_id, status, student_id"),
      supabaseAdmin.from("waitlist_entries").select("id, class_id"),
      supabaseAdmin.from("class_schedule").select("id, day, class_name, time, capacity, instructor"),
      supabaseAdmin.from("registrations").select("id, created_at, student_name, parent_name, email, approval_status, desired_class"),
      supabaseAdmin.from("invoice_requests").select("id, status, monthly_amount_cents, invoiced_amount_cents, months_remaining, created_at"),
    ]);

    const students = studentsRes.data ?? [];
    const parents = parentsRes.data ?? [];
    const enrollments = enrollmentsRes.data ?? [];
    const waitlist = waitlistRes.data ?? [];
    const classes = classesRes.data ?? [];
    const regs = regsRes.data ?? [];
    const invoices = invRes.data ?? [];

    const activeFamilies = new Set(
      students
        .filter((s) => enrollments.some((e) => e.student_id === s.id && e.status === "active"))
        .map((s) => s.parent_id),
    ).size;

    const pendingInvoices = invoices.filter((r) => r.status === "pending").length;
    const sentInvoices = invoices.filter((r) => r.status === "sent").length;
    const paidInvoices = invoices.filter((r) => r.status === "paid").length;

    const outstandingCents = invoices
      .filter((r) => r.status === "pending" || r.status === "sent")
      .reduce((sum, r) => sum + ((r.invoiced_amount_cents ?? r.monthly_amount_cents ?? 0) * (r.months_remaining ?? 1)), 0);

    const enrollmentByClass = classes.map((c) => ({
      id: c.id, class_name: c.class_name, day: c.day, time: c.time, capacity: c.capacity,
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
      pendingInvoices,
      sentInvoices,
      paidInvoices,
      outstandingCents,
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

// ---------- TEACHERS ----------
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