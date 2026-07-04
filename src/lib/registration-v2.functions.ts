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
  tuition_plan: z.enum(["monthly", "semester"]).default("monthly"),
  invoice_preference: z.enum(["monthly", "semester"]).default("monthly"),
  cash_payment: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
  idempotency_key: z.string().trim().min(8).max(80).optional().nullable(),
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
      .select("id, day, class_name, time, sort_order, capacity, description, age_group, instructor, monthly_tuition_cents, semester_tuition_cents, stripe_monthly_lookup_key, stripe_semester_lookup_key")
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

    // Idempotency: if the client passes a key and we already created an invoice
    // for that key, short-circuit and return the previous result. This makes
    // refresh / double-submit / network retry safe.
    if (data.idempotency_key) {
      const { data: existingInv } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, parent_id")
        .eq("idempotency_key", data.idempotency_key)
        .maybeSingle();
      if (existingInv) {
        return {
          ok: true,
          parent_id: (existingInv as any).parent_id,
          placements: [] as Array<{ student_id: string; class_id: string; placement: string; wait_position: number }>,
          registration_ids: [] as string[],
          invoice: { invoiceId: (existingInv as any).id, invoiceNumber: (existingInv as any).invoice_number },
          deduped: true as const,
        };
      }
    }

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
    const enrolledForInvoice: Array<{
      student_id: string; student_name: string; class_id: string; class_name: string;
      monthly_cents: number; semester_cents: number;
    }> = [];
    for (const s of data.students) {
      // Dedupe on (parent_id, first_name, last_name, date_of_birth). This
      // prevents duplicate student rows if a submission is retried without
      // an idempotency key (e.g. legacy client, network retry).
      let studentId: string;
      const { data: existingStu } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("parent_id", parentId)
        .eq("first_name", s.first_name)
        .eq("last_name", s.last_name)
        .eq("date_of_birth", s.date_of_birth)
        .maybeSingle();
      if (existingStu) {
        studentId = (existingStu as any).id;
        // Refresh mutable metadata in case it changed.
        await supabaseAdmin.from("students").update({
          grade: s.grade ?? null,
          allergies: s.allergies ?? null,
          medical_notes: s.medical_notes ?? null,
          shirt_size: s.shirt_size ?? null,
        } as never).eq("id", studentId);
      } else {
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
        studentId = stu.id;
      }
      const stu = { id: studentId };

      // Compute age (int, required by registrations table)
      const dob = new Date(s.date_of_birth + "T00:00:00");
      let age = new Date().getFullYear() - dob.getFullYear();
      const m = new Date().getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && new Date().getDate() < dob.getDate())) age--;
      if (!Number.isFinite(age) || age < 0) age = 0;

      for (const classId of s.class_ids) {
        // Class row read for name/pricing metadata used below.
        const { data: cls } = await supabaseAdmin
          .from("class_schedule")
          .select("capacity, class_name, monthly_tuition_cents, semester_tuition_cents")
          .eq("id", classId)
          .single();
        // Atomic capacity check + insert via SECURITY DEFINER RPC (locks class row).
        const { data: rpcRows, error: rpcErr } = await supabaseAdmin
          .rpc("admin_enroll_or_waitlist", { _student_id: stu.id, _class_id: classId } as never);
        if (rpcErr) throw new Error(rpcErr.message);
        const row = Array.isArray(rpcRows) ? (rpcRows[0] as any) : (rpcRows as any);
        const rawPlacement = row?.placement as string | undefined;
        const placement: "enrolled" | "waitlisted" =
          rawPlacement === "enrolled" || rawPlacement === "already_enrolled" ? "enrolled" : "waitlisted";
        const waitPosition = placement === "waitlisted" ? (row?.wait_position ?? 0) : 0;
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
            tuition_plan: data.tuition_plan,
            invoice_preference: data.invoice_preference,
            cash_payment: data.cash_payment,
          })
          .select("id")
          .single();
        if (regRow) registrationIds.push(regRow.id);

        // Track enrollment for invoice building (only enrolled, not waitlisted)
        if (placement === "enrolled") {
          enrolledForInvoice.push({
            student_id: stu.id,
            student_name: `${s.first_name} ${s.last_name}`.trim(),
            class_id: classId,
            class_name: cls?.class_name ?? "Class",
            monthly_cents: cls?.monthly_tuition_cents ?? 0,
            semester_cents: cls?.semester_tuition_cents ?? (cls?.monthly_tuition_cents ?? 0) * 4,
          });
        }
      }
    }

    // Auto-generate invoice for enrolled classes.
    let invoice: { invoiceId: string; invoiceNumber: string } | null = null;
    if (enrolledForInvoice.length > 0) {
      try {
        const { buildInvoiceForRegistration } = await import("./invoices.functions");
        invoice = await buildInvoiceForRegistration({
          parentId,
          parentName: `${data.parent.first_name} ${data.parent.last_name}`.trim(),
          parentEmail: data.parent.email.toLowerCase(),
          tuitionPlan: data.tuition_plan,
          invoicePreference: data.invoice_preference,
          cashPayment: data.cash_payment,
          notes: data.notes ?? null,
          enrollments: enrolledForInvoice,
        });
      } catch (e) {
        console.error("Invoice generation failed:", e);
      }
    }

    return { ok: true, parent_id: parentId, placements: results, registration_ids: registrationIds, invoice };
  });