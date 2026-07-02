import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BUSINESS } from "./business";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

export type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: "new" | "replied" | "resolved";
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

export const listContactAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContactRow[]> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("contact_submissions").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ContactRow[];
  });

export const replyToContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      reply: z.string().trim().min(1).max(5000),
      status: z.enum(["replied", "resolved"]).default("replied"),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub, error: e1 } = await supabaseAdmin
      .from("contact_submissions").select("*").eq("id", data.id).single();
    if (e1 || !sub) return { error: e1?.message ?? "Not found" };
    const { error } = await supabaseAdmin
      .from("contact_submissions")
      .update({
        admin_reply: data.reply,
        replied_at: new Date().toISOString(),
        status: data.status,
      } as never)
      .eq("id", data.id);
    if (error) return { error: error.message };
    try {
      const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
      await enqueueTransactionalEmail({
        templateName: "contact-reply",
        recipientEmail: (sub as any).email,
        idempotencyKey: `contact-reply-${data.id}-${Date.now()}`,
        templateData: {
          name: (sub as any).name,
          subject: (sub as any).subject,
          original: (sub as any).message,
          reply: data.reply,
          business: BUSINESS,
        },
      });
    } catch {}
    return { ok: true };
  });

export const updateContactStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["new", "replied", "resolved"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("contact_submissions").update({ status: data.status } as never).eq("id", data.id);
    if (error) return { error: error.message };
    return { ok: true };
  });