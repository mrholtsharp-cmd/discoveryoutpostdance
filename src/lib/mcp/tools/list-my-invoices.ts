import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, textResult, errorResult, requireAuth } from "../supabase";

export default defineTool({
  name: "list_my_invoices",
  title: "List my invoices",
  description: "List invoices for the signed-in parent. Optionally filter by status (draft, sent, paid, overdue, cancelled, refunded).",
  inputSchema: {
    status: z
      .enum(["draft", "sent", "paid", "overdue", "cancelled", "refunded"])
      .optional()
      .describe("Optional invoice status filter."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const supabase = supabaseForUser(ctx);
    const { data: parent, error: parentErr } = await supabase
      .from("parents").select("id").eq("auth_user_id", ctx.getUserId()).maybeSingle();
    if (parentErr) return errorResult(parentErr.message);
    if (!parent) return textResult({ invoices: [] });

    let q = supabase
      .from("invoices")
      .select("id, invoice_number, status, total_cents, refunded_amount_cents, cash_payment, sent_at, paid_at, created_at, admin_notes, line_items, payment_url")
      .eq("parent_id", parent.id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return textResult({ invoices: data ?? [] });
  },
});