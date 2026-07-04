import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint: pg_cron POSTs here on the 1st of each month.
// Auth: Supabase anon key in `apikey` header (matches Lovable cron pattern).
export const Route = createFileRoute("/api/public/hooks/monthly-tuition-invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!expected || apikey !== expected) {
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