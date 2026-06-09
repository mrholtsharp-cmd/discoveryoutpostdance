import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSchedule = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("class_schedule")
    .select("*")
    .order("day", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  day: z.string().min(1).max(20),
  class_name: z.string().min(1).max(80),
  time: z.string().min(1).max(40),
  sort_order: z.number().int().min(0).max(100),
});

export const upsertScheduleEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => entrySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("class_schedule").upsert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteScheduleEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("class_schedule").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });