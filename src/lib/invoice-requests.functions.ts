import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSeasonInfo } from "@/lib/season";

type InvoiceItem = { classLabel: string; monthlyAmountCents: number; studentName?: string };

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

// Parent-facing: submit a request for the studio to send an invoice.
export const createInvoiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { items: InvoiceItem[]; notes?: string }) => {
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Empty request");
    for (const it of data.items) {
      if (!it.classLabel || it.classLabel.length > 200) throw new Error("Invalid class label");
      if (!Number.isFinite(it.monthlyAmountCents) || it.monthlyAmountCents < 0 || it.monthlyAmountCents > 5_000_000) {
        throw new Error("Invalid amount");
      }
    }
    if (data.notes && data.notes.length > 2000) throw new Error("Notes too long");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true; count: number; group_id: string } | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userRes } = await context.supabase.auth.getUser();
    const email = userRes.user?.email;
    if (!email) return { error: "No email on account" };

    // Find or create matching parent row for this auth user.
    let { data: parent } = await supabaseAdmin
      .from("parents")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();

    if (!parent) {
      const meta = (userRes.user?.user_metadata ?? {}) as Record<string, string>;
      const { data: created, error: pErr } = await supabaseAdmin
        .from("parents")
        .insert({
          auth_user_id: context.userId,
          email: email.toLowerCase(),
          first_name: meta.first_name ?? meta.parent_name ?? "",
          last_name: meta.last_name ?? "",
          phone: meta.phone ?? "",
        })
        .select("id")
        .single();
      if (pErr || !created) return { error: pErr?.message ?? "Could not create parent" };
      parent = created;
    }

    const season = getSeasonInfo();
    const groupId = crypto.randomUUID();
    const rows = data.items.map((it) => ({
      parent_id: parent!.id,
      email,
      student_name: it.studentName ?? null,
      class_label: it.classLabel,
      monthly_amount_cents: it.monthlyAmountCents,
      season_year: season.seasonYear,
      months_remaining: season.monthsRemaining,
      status: "pending",
      request_group_id: groupId,
      admin_notes: data.notes ?? null,
    }));
    const { error } = await supabaseAdmin.from("invoice_requests").insert(rows);
    if (error) return { error: error.message };
    return { ok: true, count: rows.length, group_id: groupId };
  });

// Admin-facing: list all invoice requests, grouped by submission.
export type InvoiceRequestRow = {
  id: string;
  parent_id: string;
  email: string;
  student_name: string | null;
  class_label: string;
  monthly_amount_cents: number;
  invoiced_amount_cents: number | null;
  season_year: number;
  months_remaining: number;
  status: string;
  admin_notes: string | null;
  request_group_id: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  parent: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
};

export const listInvoiceRequestsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvoiceRequestRow[]> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("invoice_requests")
      .select("*, parent:parents(first_name, last_name, email, phone)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as InvoiceRequestRow[];
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  invoiced_amount_cents: z.number().int().min(0).max(5_000_000).nullable().optional(),
  status: z.enum(["pending", "sent", "paid", "cancelled"]).optional(),
  admin_notes: z.string().max(2000).nullable().optional(),
});

export const updateInvoiceRequestAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.invoiced_amount_cents !== undefined) patch.invoiced_amount_cents = data.invoiced_amount_cents;
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "sent") patch.sent_at = new Date().toISOString();
      if (data.status === "paid") patch.paid_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin.from("invoice_requests").update(patch as never).eq("id", data.id);
    if (error) return { error: error.message };
    return { ok: true };
  });

// Apply an update to every row in the same submission group.
export const updateInvoiceGroupAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      group_id: z.string().uuid(),
      status: z.enum(["pending", "sent", "paid", "cancelled"]).optional(),
      admin_notes: z.string().max(2000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "sent") patch.sent_at = new Date().toISOString();
      if (data.status === "paid") patch.paid_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin
      .from("invoice_requests")
      .update(patch as never)
      .eq("request_group_id", data.group_id);
    if (error) return { error: error.message };
    return { ok: true };
  });