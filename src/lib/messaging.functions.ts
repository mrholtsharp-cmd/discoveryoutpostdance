import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BUSINESS } from "./business";

async function isAdmin(context: { supabase: any; userId: string }): Promise<boolean> {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  return !!data;
}

export type ThreadRow = {
  id: string;
  parent_id: string;
  subject: string;
  status: "open" | "resolved";
  last_message_at: string;
  created_at: string;
  parent?: { first_name: string | null; last_name: string | null; email: string | null } | null;
  latest_message?: { body: string; sender_type: string; created_at: string } | null;
  unread_admin_count?: number;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  sender_type: "parent" | "admin" | "system";
  sender_name: string;
  body: string;
  created_at: string;
};

// Parent: list own threads
export const listMyThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ThreadRow[]> => {
    const { data: parent } = await context.supabase
      .from("parents").select("id").eq("auth_user_id", context.userId).maybeSingle();
    if (!parent) return [];
    const { data, error } = await context.supabase
      .from("message_threads")
      .select("*")
      .eq("parent_id", parent.id)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ThreadRow[];
  });

// Admin: list all threads with parent info
export const listAllThreadsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ThreadRow[]> => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("message_threads")
      .select("*, parent:parents(first_name, last_name, email)")
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ThreadRow[];
  });

// Get messages in a thread (both parties)
export const listThreadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { thread_id: string }) => z.object({ thread_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("messages").select("*").eq("thread_id", data.thread_id).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageRow[];
  });

// Parent: create a new thread with an initial message
export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; thread_id: string } | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes } = await context.supabase.auth.getUser();
    const { data: parent } = await context.supabase
      .from("parents").select("*").eq("auth_user_id", context.userId).maybeSingle();
    if (!parent) return { error: "No parent profile yet — please register a student first." };

    const { data: thread, error: tErr } = await supabaseAdmin
      .from("message_threads")
      .insert({ parent_id: parent.id, subject: data.subject, status: "open" } as never)
      .select("id").single();
    if (tErr || !thread) return { error: tErr?.message ?? "Could not create thread" };

    const senderName = `${parent.first_name ?? ""} ${parent.last_name ?? ""}`.trim() || userRes.user?.email || "Parent";
    const { error: mErr } = await supabaseAdmin.from("messages").insert({
      thread_id: thread.id,
      sender_type: "parent",
      sender_user_id: context.userId,
      sender_name: senderName,
      body: data.body,
    } as never);
    if (mErr) return { error: mErr.message };

    // Notify admin
    try {
      const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
      await enqueueTransactionalEmail({
        templateName: "message-notification",
        recipientEmail: BUSINESS.email,
        idempotencyKey: `msg-new-${thread.id}`,
        templateData: { fromName: senderName, subject: data.subject, body: data.body, direction: "to_admin" },
      });
    } catch {}
    return { ok: true, thread_id: thread.id };
  });

// Post message to existing thread (parent OR admin)
export const postMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      thread_id: z.string().uuid(),
      body: z.string().trim().min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = await isAdmin(context);

    // Load thread + parent for authz + notify
    const { data: thread } = await supabaseAdmin
      .from("message_threads")
      .select("*, parent:parents(*)")
      .eq("id", data.thread_id)
      .single();
    if (!thread) return { error: "Thread not found" };

    let senderType: "admin" | "parent" = admin ? "admin" : "parent";
    let senderName: string;
    let notifyEmail: string | undefined;
    let direction: "to_parent" | "to_admin";

    if (admin) {
      senderName = BUSINESS.name + " Studio";
      notifyEmail = (thread as any).parent?.email ?? undefined;
      direction = "to_parent";
    } else {
      // parent path — verify ownership
      const { data: p } = await supabaseAdmin
        .from("parents").select("id, first_name, last_name, email")
        .eq("auth_user_id", context.userId).maybeSingle();
      if (!p || p.id !== (thread as any).parent_id) return { error: "Forbidden" };
      senderName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "Parent";
      notifyEmail = BUSINESS.email;
      direction = "to_admin";
    }

    const { error: mErr } = await supabaseAdmin.from("messages").insert({
      thread_id: data.thread_id,
      sender_type: senderType,
      sender_user_id: context.userId,
      sender_name: senderName,
      body: data.body,
    } as never);
    if (mErr) return { error: mErr.message };

    await supabaseAdmin.from("message_threads").update({ last_message_at: new Date().toISOString() } as never).eq("id", data.thread_id);

    try {
      const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
      if (notifyEmail) {
        await enqueueTransactionalEmail({
          templateName: "message-notification",
          recipientEmail: notifyEmail,
          idempotencyKey: `msg-${data.thread_id}-${Date.now()}`,
          templateData: { fromName: senderName, subject: (thread as any).subject, body: data.body, direction },
        });
      }
    } catch {}
    return { ok: true };
  });

// Admin: update thread status
export const updateThreadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ thread_id: z.string().uuid(), status: z.enum(["open", "resolved"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    if (!(await isAdmin(context))) return { error: "Forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("message_threads").update({ status: data.status } as never).eq("id", data.thread_id);
    if (error) return { error: error.message };
    return { ok: true };
  });