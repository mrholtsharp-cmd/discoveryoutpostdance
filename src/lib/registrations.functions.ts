import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const searchRegistrationsSchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  desired_class: z.string().trim().max(100).optional().default(""),
  experience_level: z.string().trim().max(50).optional().default(""),
  is_trial: z.enum(["all", "yes", "no"]).optional().default("all"),
  approval_status: z.enum(["all", "pending", "approved", "waitlisted", "declined"]).optional().default("all"),
  date_from: z.string().trim().max(40).optional().default(""),
  date_to: z.string().trim().max(40).optional().default(""),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
  page: z.number().int().min(1).max(10_000).optional().default(1),
  page_size: z.union([z.literal(25), z.literal(50), z.literal(100)]).optional().default(25),
});

export const searchRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchRegistrationsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    let q = context.supabase
      .from("registrations")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: data.sort === "oldest" });

    if (data.search) {
      const s = data.search.replace(/[%,()]/g, " ").trim();
      if (s) {
        const pat = `%${s}%`;
        q = q.or(
          `student_name.ilike.${pat},parent_name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat}`,
        );
      }
    }
    if (data.desired_class) q = q.eq("desired_class", data.desired_class);
    if (data.experience_level) q = q.eq("experience_level", data.experience_level);
    if (data.is_trial === "yes") q = q.eq("is_trial", true);
    if (data.is_trial === "no") q = q.eq("is_trial", false);
    if (data.approval_status && data.approval_status !== "all") q = q.eq("approval_status", data.approval_status);
    if (data.date_from) q = q.gte("created_at", new Date(data.date_from).toISOString());
    if (data.date_to) {
      const end = new Date(data.date_to);
      end.setHours(23, 59, 59, 999);
      q = q.lte("created_at", end.toISOString());
    }

    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    q = q.range(from, to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: rows ?? [],
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
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

const exportSchema = searchRegistrationsSchema.omit({ page: true, page_size: true });

export const exportRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => exportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    let q = context.supabase
      .from("registrations")
      .select("*")
      .order("created_at", { ascending: data.sort === "oldest" })
      .limit(10000);

    if (data.search) {
      const s = data.search.replace(/[%,()]/g, " ").trim();
      if (s) {
        const pat = `%${s}%`;
        q = q.or(
          `student_name.ilike.${pat},parent_name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat}`,
        );
      }
    }
    if (data.desired_class) q = q.eq("desired_class", data.desired_class);
    if (data.experience_level) q = q.eq("experience_level", data.experience_level);
    if (data.is_trial === "yes") q = q.eq("is_trial", true);
    if (data.is_trial === "no") q = q.eq("is_trial", false);
    if (data.approval_status && data.approval_status !== "all") q = q.eq("approval_status", data.approval_status);
    if (data.date_from) q = q.gte("created_at", new Date(data.date_from).toISOString());
    if (data.date_to) {
      const end = new Date(data.date_to);
      end.setHours(23, 59, 59, 999);
      q = q.lte("created_at", end.toISOString());
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });