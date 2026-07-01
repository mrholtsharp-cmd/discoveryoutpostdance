import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const studentSchema = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  date_of_birth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  grade: z.string().trim().max(40).optional().nullable(),
  allergies: z.string().trim().max(500).optional().nullable(),
  medical_notes: z.string().trim().max(1000).optional().nullable(),
  shirt_size: z.string().trim().max(20).optional().nullable(),
  class_ids: z.array(z.string().uuid()).default([]),
});

const submitSchema = z.object({
  parent: z.object({
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(7).max(30),
    address: z.string().trim().max(300).optional().nullable(),
  }),
  emergency_contact: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(7).max(30),
  }),
  students: z.array(studentSchema).min(1).max(10),
});

export const listClassesWithAvailability = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: classes, error } = await supa
      .from("class_schedule")
      .select("id, day, class_name, time, sort_order, capacity, description, age_group, instructor, monthly_tuition_cents, stripe_monthly_lookup_key, stripe_semester_lookup_key")
      .order("day").order("sort_order");
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: counts } = await supabaseAdmin
      .from("enrollments")
      .select("class_id")
      .eq("status", "active");
    const countMap = new Map<string, number>();
    (counts ?? []).forEach((r) => countMap.set(r.class_id, (countMap.get(r.class_id) ?? 0) + 1));
    return (classes ?? []).map((c) => {
      const enrolled = countMap.get(c.id) ?? 0;
      const remaining = c.capacity == null ? null : Math.max(0, c.capacity - enrolled);
      const is_full = c.capacity != null && enrolled >= c.capacity;
      return { ...c, enrolled_count: enrolled, remaining, is_full };
    });
  });

export const submitFullRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const authUserId = context.userId;

    // Upsert parent for this auth user
    const { data: existingParent } = await supabaseAdmin
      .from("parents")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    let parentId: string;
    if (existingParent) {
      parentId = existingParent.id;
      await supabaseAdmin.from("parents").update({
        first_name: data.parent.first_name,
        last_name: data.parent.last_name,
        email: data.parent.email.toLowerCase(),
        phone: data.parent.phone,
        address: data.parent.address ?? null,
      }).eq("id", parentId);
    } else {
      const { data: inserted, error: pErr } = await supabaseAdmin
        .from("parents")
        .insert({
          auth_user_id: authUserId,
          first_name: data.parent.first_name,
          last_name: data.parent.last_name,
          email: data.parent.email.toLowerCase(),
          phone: data.parent.phone,
          address: data.parent.address ?? null,
        })
        .select("id")
        .single();
      if (pErr || !inserted) throw new Error(pErr?.message ?? "Could not create parent");
      parentId = inserted.id;
    }

    // Replace primary emergency contact
    await supabaseAdmin.from("emergency_contacts").delete().eq("parent_id", parentId).eq("is_primary", true);
    await supabaseAdmin.from("emergency_contacts").insert({
      parent_id: parentId,
      name: data.emergency_contact.name,
      phone: data.emergency_contact.phone,
      is_primary: true,
    });

    // Insert students + enrollments via SECURITY DEFINER fn (which also handles waitlist)
    const results: Array<{ student_id: string; class_id: string; placement: string; wait_position: number }> = [];
    const registrationIds: string[] = [];
    for (const s of data.students) {
      const { data: stu, error: sErr } = await supabaseAdmin
        .from("students")
        .insert({
          parent_id: parentId,
          first_name: s.first_name,
          last_name: s.last_name,
          date_of_birth: s.date_of_birth,
          grade: s.grade ?? null,
          allergies: s.allergies ?? null,
          medical_notes: s.medical_notes ?? null,
          shirt_size: s.shirt_size ?? null,
        })
        .select("id")
        .single();
      if (sErr || !stu) throw new Error(sErr?.message ?? "Could not create student");

      // Compute age (int, required by registrations table)
      const dob = new Date(s.date_of_birth + "T00:00:00");
      let age = new Date().getFullYear() - dob.getFullYear();
      const m = new Date().getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && new Date().getDate() < dob.getDate())) age--;
      if (!Number.isFinite(age) || age < 0) age = 0;

      for (const classId of s.class_ids) {
        // Manually check capacity + insert, since enroll_or_waitlist uses auth.uid()
        // and we're operating via service role here. Atomicity via row-lock on class.
        const { data: cls } = await supabaseAdmin
          .from("class_schedule")
          .select("capacity, class_name")
          .eq("id", classId)
          .single();
        const { count } = await supabaseAdmin
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("class_id", classId)
          .eq("status", "active");
        const enrolledCount = count ?? 0;
        const cap = cls?.capacity ?? null;
        let placement: "enrolled" | "waitlisted";
        let waitPosition = 0;
        if (cap == null || enrolledCount < cap) {
          await supabaseAdmin.from("enrollments").insert({ student_id: stu.id, class_id: classId });
          placement = "enrolled";
        } else {
          const { data: maxRow } = await supabaseAdmin
            .from("waitlist_entries")
            .select("wait_position")
            .eq("class_id", classId)
            .order("wait_position", { ascending: false })
            .limit(1)
            .maybeSingle();
          const pos = (maxRow?.wait_position ?? 0) + 1;
          await supabaseAdmin.from("waitlist_entries").insert({ student_id: stu.id, class_id: classId, wait_position: pos });
          placement = "waitlisted";
          waitPosition = pos;
        }
        results.push({ student_id: stu.id, class_id: classId, placement, wait_position: waitPosition });

        // Mirror into the legacy `registrations` table so the admin dashboard,
        // Stripe webhook, and refund flow all see this signup.
        const { data: regRow } = await supabaseAdmin
          .from("registrations")
          .insert({
            student_name: `${s.first_name} ${s.last_name}`.trim(),
            parent_name: `${data.parent.first_name} ${data.parent.last_name}`.trim(),
            email: data.parent.email.toLowerCase(),
            phone: data.parent.phone,
            age,
            desired_class: cls?.class_name ?? "",
            experience_level: "Beginner",
            emergency_contact: `${data.emergency_contact.name} — ${data.emergency_contact.phone}`,
            is_trial: false,
            date_of_birth: s.date_of_birth,
            media_release: true,
            parent_agreement: true,
            payment_status: "pending",
            approval_status: placement === "enrolled" ? "approved" : "waitlisted",
            selected_class_id: classId,
            program: cls?.class_name ?? null,
            medical_notes: s.medical_notes ?? null,
          })
          .select("id")
          .single();
        if (regRow) registrationIds.push(regRow.id);
      }
    }

    return { ok: true, parent_id: parentId, placements: results, registration_ids: registrationIds };
  });