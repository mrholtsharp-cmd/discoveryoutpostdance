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
    const { error } = await supabaseAdmin.from("registrations").update(patch as never).eq("id", data.id);
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