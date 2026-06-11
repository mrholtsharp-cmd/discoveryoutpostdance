import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

export const listTuitionItems = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tuition_items")
    .select("*")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["class_monthly", "class_semester", "one_time"]),
  name: z.string().min(1).max(80),
  display_price: z.string().min(1).max(40),
  description: z.string().max(400).default(""),
  stripe_price_id: z.string().min(1).max(80),
  sort_order: z.number().int().min(0).max(1000),
  active: z.boolean(),
});

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error: rpcError } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (isAdmin) return;

  if (rpcError) console.error("Admin role check failed:", rpcError.message);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roleRow, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!roleRow) throw new Error("Forbidden");
}

export const upsertTuitionItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase
      .from("tuition_items")
      .upsert({ ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTuitionItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("tuition_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type StripePriceOption = {
  stripe_price_id: string;       // lookup_key when present, else Stripe price id
  product_name: string;
  display_price: string;
  description: string;
  recurring_interval: string | null;  // 'month' | 'year' | null
  suggested_kind: "class_monthly" | "class_semester" | "one_time";
};

function formatAmount(amount: number | null, currency: string): string {
  const major = (amount ?? 0) / 100;
  const sign = currency.toLowerCase() === "usd" ? "$" : "";
  return `${sign}${major.toFixed(major % 1 === 0 ? 0 : 2)}`;
}

export const listStripePrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { environment: StripeEnv }) => d)
  .handler(async ({ data, context }): Promise<{ prices: StripePriceOption[] } | { error: string }> => {
    await ensureAdmin(context);
    try {
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });
      const options: StripePriceOption[] = prices.data
        .filter((p) => p.product && typeof p.product !== "string" && !(p.product as any).deleted)
        .map((p) => {
          const product = p.product as any;
          const interval = p.recurring?.interval ?? null;
          const amountStr = formatAmount(p.unit_amount, p.currency);
          const intervalSuffix = interval === "month" ? "/mo" : interval === "year" ? "/yr" : "";
          const suggested_kind: StripePriceOption["suggested_kind"] =
            interval === "month" ? "class_monthly" : interval ? "class_semester" : "one_time";
          return {
            stripe_price_id: p.lookup_key || p.id,
            product_name: product.name as string,
            display_price: `${amountStr}${intervalSuffix}`,
            description: product.description || "",
            recurring_interval: interval,
            suggested_kind,
          };
        });
      return { prices: options };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

const importSchema = z.object({
  items: z.array(z.object({
    kind: z.enum(["class_monthly", "class_semester", "one_time"]),
    name: z.string().min(1).max(80),
    display_price: z.string().min(1).max(40),
    description: z.string().max(400).default(""),
    stripe_price_id: z.string().min(1).max(80),
  })).min(1).max(50),
});

export const importStripePrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("tuition_items")
      .select("id, stripe_price_id, sort_order");
    const existingByPriceId = new Map((existing ?? []).map((r) => [r.stripe_price_id, r]));
    let inserted = 0;
    let updated = 0;

    for (const [i, it] of data.items.entries()) {
      const existingRow = existingByPriceId.get(it.stripe_price_id);
      const payload = {
        kind: it.kind,
        name: it.name,
        display_price: it.display_price,
        description: it.description,
        stripe_price_id: it.stripe_price_id,
        sort_order: existingRow?.sort_order ?? 100 + i,
        active: true,
        updated_at: new Date().toISOString(),
      };
      const { error } = existingRow
        ? await supabaseAdmin.from("tuition_items").update(payload).eq("id", existingRow.id)
        : await supabaseAdmin.from("tuition_items").insert(payload);
      if (error) throw new Error(error.message);
      if (existingRow) updated += 1;
      else inserted += 1;
    }

    return { ok: true, inserted, updated };
  });