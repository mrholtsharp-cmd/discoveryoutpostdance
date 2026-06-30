import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getOrCreateParentId(
  supabase: any,
  userId: string,
  email: string | undefined,
): Promise<string | null> {
  const { data } = await supabase
    .from("parents")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (data?.id) return data.id;
  return null;
}

export const getMyPortalSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: authUser } = await supabase.auth.getUser();
    const email = authUser.user?.email ?? null;

    const { data: parent } = await supabase
      .from("parents")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!parent) {
      return {
        parent: null,
        students: [],
        emergency_contacts: [],
        invoice_requests: [],
        email,
      };
    }

    const [studentsRes, ecRes, invRes] = await Promise.all([
      supabase
        .from("students")
        .select("*")
        .eq("parent_id", parent.id)
        .order("created_at"),
      supabase
        .from("emergency_contacts")
        .select("*")
        .eq("parent_id", parent.id)
        .order("is_primary", { ascending: false }),
      supabase
        .from("invoice_requests")
        .select("*")
        .or(`parent_id.eq.${parent.id},parent_id.eq.${userId}`)
        .order("created_at", { ascending: false }),
    ]);

    const students = studentsRes.data ?? [];
    const studentIds = students.map((s: any) => s.id);

    let enrollments: any[] = [];
    let waitlist: any[] = [];
    if (studentIds.length) {
      const [enRes, wlRes] = await Promise.all([
        supabase
          .from("enrollments")
          .select("id, student_id, class_id, status, enrolled_at, class_schedule:class_id(id, day, class_name, time, instructor, monthly_tuition_cents, age_group)")
          .in("student_id", studentIds)
          .order("enrolled_at", { ascending: false }),
        supabase
          .from("waitlist_entries")
          .select("id, student_id, class_id, wait_position, created_at, class_schedule:class_id(id, day, class_name, time, instructor, age_group)")
          .in("student_id", studentIds),
      ]);
      enrollments = enRes.data ?? [];
      waitlist = wlRes.data ?? [];
    }

    return {
      parent,
      email,
      students: students.map((s: any) => ({
        ...s,
        enrollments: enrollments.filter((e) => e.student_id === s.id),
        waitlist: waitlist.filter((w) => w.student_id === s.id),
      })),
      emergency_contacts: ecRes.data ?? [],
      invoice_requests: invRes.data ?? [],
    };
  });

const parentUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(5).max(30),
  address: z.string().trim().max(300).optional().nullable(),
});

export const updateMyParent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parentUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("parents")
      .update(data)
      .eq("auth_user_id", context.userId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

const ecSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(30),
  is_primary: z.boolean().optional().default(false),
});

export const upsertEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ecSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: parent } = await context.supabase
      .from("parents").select("id").eq("auth_user_id", context.userId).maybeSingle();
    if (!parent) return { error: "No parent profile" };
    if (data.id) {
      const { error } = await context.supabase
        .from("emergency_contacts")
        .update({ name: data.name, phone: data.phone, is_primary: data.is_primary })
        .eq("id", data.id)
        .eq("parent_id", parent.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await context.supabase.from("emergency_contacts").insert({
        parent_id: parent.id, name: data.name, phone: data.phone, is_primary: data.is_primary ?? false,
      });
      if (error) return { error: error.message };
    }
    return { ok: true as const };
  });

export const deleteEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("emergency_contacts").delete().eq("id", data.id);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

const studentSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grade: z.string().trim().max(40).optional().nullable(),
  allergies: z.string().trim().max(500).optional().nullable(),
  medical_notes: z.string().trim().max(1000).optional().nullable(),
  shirt_size: z.string().trim().max(20).optional().nullable(),
});

export const upsertStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => studentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: parent } = await context.supabase
      .from("parents").select("id").eq("auth_user_id", context.userId).maybeSingle();
    if (!parent) return { error: "No parent profile" };
    const payload = {
      first_name: data.first_name,
      last_name: data.last_name,
      date_of_birth: data.date_of_birth,
      grade: data.grade ?? null,
      allergies: data.allergies ?? null,
      medical_notes: data.medical_notes ?? null,
      shirt_size: data.shirt_size ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("students").update(payload).eq("id", data.id).eq("parent_id", parent.id);
      if (error) return { error: error.message };
      return { ok: true as const, id: data.id };
    } else {
      const { data: ins, error } = await context.supabase
        .from("students").insert({ ...payload, parent_id: parent.id }).select("id").single();
      if (error) return { error: error.message };
      return { ok: true as const, id: ins.id };
    }
  });

export const joinClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { studentId: string; classId: string }) =>
    z.object({ studentId: z.string().uuid(), classId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("enroll_or_waitlist", {
      _student_id: data.studentId,
      _class_id: data.classId,
    });
    if (error) return { error: error.message };
    const row = Array.isArray(res) ? res[0] : res;
    return { ok: true as const, placement: row?.placement as string, position: row?.wait_position as number };
  });

export const cancelEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enrollmentId: string }) =>
    z.object({ enrollmentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("enrollments")
      .update({ status: "cancelled" })
      .eq("id", data.enrollmentId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

export const leaveWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { waitlistId: string }) =>
    z.object({ waitlistId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("waitlist_entries").delete().eq("id", data.waitlistId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

export type PortalSnapshot = Awaited<ReturnType<typeof getMyPortalSnapshot>>;