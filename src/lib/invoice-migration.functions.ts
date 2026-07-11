import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MIGRATION_MARKER = "[migrated-v2] cleared stale Stripe link";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!ok) throw new Error("Forbidden");
}

type Row = {
  id: string;
  invoice_number: string;
  status: string;
  cash_payment: boolean;
  total_cents: number;
  parent_id: string | null;
  parent_name: string | null;
  parent_email: string | null;
  payment_url: string | null;
  stripe_session_id: string | null;
  admin_notes: string | null;
  semester_year: number | null;
  renewal_month: string | null;
  tuition_plan: string | null;
  line_count: number;
};

async function loadAll(): Promise<Row[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select(
      "id, invoice_number, status, cash_payment, total_cents, parent_id, parent_name, parent_email, payment_url, stripe_session_id, admin_notes, semester_year, renewal_month, tuition_plan, invoice_line_items(id)",
    );
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    cash_payment: !!r.cash_payment,
    total_cents: r.total_cents ?? 0,
    parent_id: r.parent_id,
    parent_name: r.parent_name,
    parent_email: r.parent_email,
    payment_url: r.payment_url,
    stripe_session_id: r.stripe_session_id,
    admin_notes: r.admin_notes,
    semester_year: r.semester_year,
    renewal_month: r.renewal_month,
    tuition_plan: r.tuition_plan,
    line_count: (r.invoice_line_items ?? []).length,
  }));
}

function categorize(rows: Row[]) {
  const drafts_with_stale_link: Row[] = [];
  const cash_drafts_with_link: Row[] = [];
  const cancelled_with_link: Row[] = [];
  const paid_preserved: Row[] = [];
  const refunded_preserved: Row[] = [];
  const missing_line_items: Row[] = [];
  const missing_parent_link: Row[] = [];
  const compatible: Row[] = [];

  const dupMap = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.status !== "cancelled") {
      const key = `${r.parent_id ?? "-"}::${r.semester_year ?? "-"}::${r.renewal_month ?? "-"}::${r.tuition_plan ?? "-"}`;
      const arr = dupMap.get(key) ?? [];
      arr.push(r);
      dupMap.set(key, arr);
    }
  }
  const duplicates_needing_review: Row[][] = [];
  for (const [, arr] of dupMap) if (arr.length > 1) duplicates_needing_review.push(arr);

  for (const r of rows) {
    if (!r.parent_id) missing_parent_link.push(r);
    if (r.line_count === 0 && r.total_cents > 0) missing_line_items.push(r);

    const hasLink = !!r.payment_url || !!r.stripe_session_id;
    if (r.status === "paid") { paid_preserved.push(r); continue; }
    if (r.status === "refunded" || r.status === "partial_refund") { refunded_preserved.push(r); continue; }
    if (r.status === "cancelled" && hasLink) { cancelled_with_link.push(r); continue; }
    if (r.status === "new" && r.cash_payment && hasLink) { cash_drafts_with_link.push(r); continue; }
    if (r.status === "new" && !r.cash_payment && hasLink) { drafts_with_stale_link.push(r); continue; }
    compatible.push(r);
  }

  return {
    total: rows.length,
    compatible,
    drafts_with_stale_link,
    cash_drafts_with_link,
    cancelled_with_link,
    paid_preserved,
    refunded_preserved,
    missing_line_items,
    missing_parent_link,
    duplicates_needing_review,
  };
}

export const previewInvoiceMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const rows = await loadAll();
    return categorize(rows);
  });

export const runInvoiceMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal(true) }).parse(d))
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStripe } = await import("@/lib/stripe.server");

    const rows = await loadAll();
    const cats = categorize(rows);
    const targets: Row[] = [
      ...cats.drafts_with_stale_link,
      ...cats.cash_drafts_with_link,
      ...cats.cancelled_with_link,
    ];

    let links_cleared = 0;
    let sessions_expired = 0;
    let sessions_already_expired = 0;
    let skipped_already_migrated = 0;
    const errors: Array<{ invoice_number: string; error: string }> = [];

    for (const r of targets) {
      const alreadyMarked = (r.admin_notes ?? "").includes(MIGRATION_MARKER);
      if (alreadyMarked && !r.payment_url && !r.stripe_session_id) {
        skipped_already_migrated++;
        continue;
      }

      if (r.stripe_session_id) {
        try {
          await getStripe().checkout.sessions.expire(r.stripe_session_id);
          sessions_expired++;
        } catch (e: any) {
          const msg = String(e?.message ?? e ?? "");
          if (/already expired|No such|has expired/i.test(msg)) sessions_already_expired++;
          else errors.push({ invoice_number: r.invoice_number, error: `Stripe expire: ${msg}` });
        }
      }

      const nowIso = new Date().toISOString();
      const stampedNotes = `${r.admin_notes ? r.admin_notes + "\n" : ""}${MIGRATION_MARKER} on ${nowIso}`;
      const { error } = await supabaseAdmin
        .from("invoices")
        .update({
          payment_url: null,
          stripe_session_id: null,
          stripe_session_created_at: null,
          stripe_session_expires_at: null,
          admin_notes: stampedNotes,
          updated_at: nowIso,
        } as never)
        .eq("id", r.id);
      if (error) {
        errors.push({ invoice_number: r.invoice_number, error: error.message });
        continue;
      }
      links_cleared++;
    }

    return {
      links_cleared,
      sessions_expired,
      sessions_already_expired,
      skipped_already_migrated,
      manual_review: {
        missing_line_items: cats.missing_line_items.length,
        missing_parent_link: cats.missing_parent_link.length,
        duplicate_groups: cats.duplicates_needing_review.length,
      },
      preserved: {
        paid: cats.paid_preserved.length,
        refunded: cats.refunded_preserved.length,
      },
      errors,
    };
  });

export type MigrationPreview = Awaited<ReturnType<typeof previewInvoiceMigration>>;
export type MigrationResult = Awaited<ReturnType<typeof runInvoiceMigration>>;