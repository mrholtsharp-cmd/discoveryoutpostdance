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

    // Send via Lovable email infrastructure if available; otherwise log code so admins can deliver manually.
    let delivery: "email" | "skipped" = "skipped";
    try {
      const mod: any = await import(/* @vite-ignore */ "@lovable.dev/email-js" as string).catch(() => null);
      if (mod && process.env.LOVABLE_API_KEY && process.env.SENDER_DOMAIN) {
        const sender = mod.createEmailSender?.({ apiKey: process.env.LOVABLE_API_KEY });
        if (sender) {
          await sender.send({
            from: `Discovery Outpost <noreply@${process.env.SENDER_DOMAIN}>`,
            to: email,
            subject: "Your Discovery Outpost verification code",
            html: `<p>Your verification code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>This code expires in 15 minutes.</p>`,
            text: `Your verification code is ${code}. It expires in 15 minutes.`,
          });
          delivery = "email";
        }
      }
    } catch (e) {
      await logAudit({ event_type: "verify_failed", email, error_message: `email_send: ${(e as Error).message}` });
    }

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
    const { error } = await supabaseAdmin.from("registrations").insert({
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
      registration_id: (error as null) ?? null,
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