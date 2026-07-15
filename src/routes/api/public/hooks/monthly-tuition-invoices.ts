import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Cron endpoint: pg_cron POSTs here on the 1st of each month.
// Auth: server-only service-role key in `Authorization: Bearer <key>` header,
// pulled from vault by pg_cron (same pattern as email_queue_dispatch). The
// publishable/anon key is NOT accepted here — it's public and would let anyone
// on the internet trigger invoice generation.
export const Route = createFileRoute("/api/public/hooks/monthly-tuition-invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
        const a = Buffer.from(presented);
        const b = Buffer.from(expected);
        if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { generateMonthlyRenewalInvoices } = await import("@/lib/monthly-invoices.functions");
          const result = await generateMonthlyRenewalInvoices();
          console.log("[monthly-renewal] result", result);
          return Response.json(result);
        } catch (e: any) {
          console.error("[monthly-renewal] failed", e);
          return new Response(`Handler error: ${e?.message ?? "unknown"}`, { status: 500 });
        }
      },
    },
  },
});