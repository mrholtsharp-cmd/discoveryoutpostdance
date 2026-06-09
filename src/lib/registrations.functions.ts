import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const registrationSchema = z.object({
  student_name: z.string().trim().min(1).max(100),
  parent_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
  age: z.number().int().min(2).max(99),
  desired_class: z.enum(["Tap", "Jazz", "Ballet"]),
  experience_level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  medical_notes: z.string().trim().max(1000).optional().nullable(),
  emergency_contact: z.string().trim().min(1).max(200),
  is_trial: z.boolean().optional(),
});

export const submitRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registrationSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("registrations").insert({
      ...data,
      medical_notes: data.medical_notes ?? null,
      is_trial: data.is_trial ?? false,
    });
    if (error) throw new Error(error.message);
    // TODO: Send confirmation + studio notification email once email domain is set up
    return { ok: true };
  });

export const listRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("registrations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!data, userId: context.userId };
  });