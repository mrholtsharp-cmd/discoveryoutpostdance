// Stripe payments have been removed. This module now only hosts small
// parent-portal helpers. Registrations always finish via an invoice request
// (see `createInvoiceRequest` in `@/lib/invoice-requests.functions`).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Re-export so components that already import from this path keep working.
export { createInvoiceRequest } from "@/lib/invoice-requests.functions";

export const updateMyContactInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone?: string; parentName?: string }) => {
    if (data.phone && (data.phone.length < 5 || data.phone.length > 30)) {
      throw new Error("Phone must be 5–30 characters");
    }
    if (data.parentName && (data.parentName.length < 1 || data.parentName.length > 100)) {
      throw new Error("Name must be 1–100 characters");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    const meta: Record<string, string> = {};
    if (data.phone !== undefined) meta.phone = data.phone;
    if (data.parentName !== undefined) meta.parent_name = data.parentName;
    const { error } = await context.supabase.auth.updateUser({ data: meta });
    if (error) return { error: error.message };
    return { ok: true };
  });