import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { createHash, randomInt } from "crypto";

const registrationSchema = z.object({
  student_name: z.string().trim().min(1).max(100),
  parent_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
  age: z.number().int().min(2).max(99),
  desired_class: z.enum(["Tap", "Jazz", "Ballet", "Musical Theater"]),
  experience_level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  medical_notes: z.string().trim().max(1000).optional().nullable(),
  emergency_contact: z.string().trim().min(1).max(200),
  is_trial: z.boolean().optional(),
  verification_code: z.string().trim().regex(/^\d{6}$/),
});

function hashCode(code: string, email: string): string {
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

function getSource() {
  try {
    const req = getRequest();
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const ip = fwd.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || null;
    const ua = req.headers.get("user-agent") ?? null;
    return { ip, ua };
  } catch {
    return { ip: null as string | null, ua: null as string | null };
  }
}

async function logAudit(args: {
  event_type: "verify_requested" | "verify_failed" | "verify_succeeded" | "submit_success" | "submit_failed";
  email?: string | null;
  error_message?: string | null;
  registration_id?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ip, ua } = getSource();
  await supabaseAdmin.from("registration_audit_log").insert({
    event_type: args.event_type,
    email: args.email ?? null,
    ip_address: ip,
    user_agent: ua,
    error_message: args.error_message ?? null,
    registration_id: args.registration_id ?? null,
    metadata: (args.metadata ?? null) as never,
  });
}

const requestVerificationSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const requestEmailVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => requestVerificationSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ip } = getSource();

    // Basic per-email rate limit: max 5 codes / hour
    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("registration_email_verifications")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", sinceIso);
    if ((count ?? 0) >= 5) {
      await logAudit({ event_type: "verify_failed", email, error_message: "rate_limited" });
      throw new Error("Too many codes requested. Please wait an hour and try again.");
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: insertErr } = await supabaseAdmin
      .from("registration_email_verifications")
      .insert({
        email,
        code_hash: hashCode(code, email),
        expires_at: expiresAt,
        ip_address: ip,
      });
    if (insertErr) {
      await logAudit({ event_type: "verify_failed", email, error_message: insertErr.message });
      throw new Error("Could not issue verification code.");
    }

    // Email delivery is wired through Lovable's transactional email pipeline,
    // which requires the email domain to be set up. Until then we still create
    // the code + audit row so the flow can be exercised end-to-end by admins.
    const delivery: "email" | "pending_email_setup" = "pending_email_setup";
    await logAudit({ event_type: "verify_requested", email, metadata: { delivery } });
    return { ok: true, delivery };
  });

export const submitRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registrationSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify the code
    const { data: rows, error: lookupErr } = await supabaseAdmin
      .from("registration_email_verifications")
      .select("id, code_hash, expires_at, consumed_at, attempts")
      .eq("email", email)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (lookupErr) {
      await logAudit({ event_type: "submit_failed", email, error_message: lookupErr.message });
      throw new Error("Could not verify code.");
    }
    const row = rows?.[0];
    if (!row) {
      await logAudit({ event_type: "verify_failed", email, error_message: "no_pending_code" });
      throw new Error("No active verification code. Please request a new code.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await logAudit({ event_type: "verify_failed", email, error_message: "code_expired" });
      throw new Error("Verification code expired. Please request a new code.");
    }
    if ((row.attempts ?? 0) >= 5) {
      await logAudit({ event_type: "verify_failed", email, error_message: "too_many_attempts" });
      throw new Error("Too many incorrect attempts. Please request a new code.");
    }
    const matches = row.code_hash === hashCode(data.verification_code, email);
    if (!matches) {
      await supabaseAdmin
        .from("registration_email_verifications")
        .update({ attempts: (row.attempts ?? 0) + 1 })
        .eq("id", row.id);
      await logAudit({ event_type: "verify_failed", email, error_message: "bad_code" });
      throw new Error("Incorrect verification code.");
    }
    await supabaseAdmin
      .from("registration_email_verifications")
      .update({ verified_at: new Date().toISOString(), consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    await logAudit({ event_type: "verify_succeeded", email });

    // Insert registration
    const { data: inserted, error } = await supabaseAdmin.from("registrations").insert({
      student_name: data.student_name,
      parent_name: data.parent_name,
      email,
      phone: data.phone,
      age: data.age,
      desired_class: data.desired_class,
      experience_level: data.experience_level,
      emergency_contact: data.emergency_contact,
      medical_notes: data.medical_notes ?? null,
      is_trial: data.is_trial ?? false,
    }).select("id").single();
    if (error) {
      await logAudit({ event_type: "submit_failed", email, error_message: error.message });
      throw new Error(error.message);
    }
    await logAudit({
      event_type: "submit_success",
      email,
      registration_id: inserted?.id ?? null,
      metadata: { desired_class: data.desired_class, is_trial: data.is_trial ?? false },
    });
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

const searchRegistrationsSchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  desired_class: z.string().trim().max(100).optional().default(""),
  experience_level: z.string().trim().max(50).optional().default(""),
  is_trial: z.enum(["all", "yes", "no"]).optional().default("all"),
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

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("registration_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });