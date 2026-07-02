import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().default(""),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

export const Route = createFileRoute("/api/public/contact")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
        },
      }),
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); }
        catch { return json({ error: "Invalid JSON" }, 400); }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return json({ error: parsed.error.errors[0]?.message ?? "Invalid" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("contact_submissions")
          .insert({
            name: parsed.data.name,
            email: parsed.data.email.toLowerCase(),
            phone: parsed.data.phone || null,
            subject: parsed.data.subject,
            message: parsed.data.message,
            status: "new",
          } as never)
          .select("id").single();
        if (error || !data) return json({ error: error?.message ?? "Failed" }, 500);

        // Notify admin
        try {
          const { enqueueTransactionalEmail } = await import("@/lib/email/internal-send.server");
          const { BUSINESS } = await import("@/lib/business");
          await enqueueTransactionalEmail({
            templateName: "contact-received",
            recipientEmail: BUSINESS.email,
            idempotencyKey: `contact-received-${data.id}`,
            templateData: {
              name: parsed.data.name,
              email: parsed.data.email,
              phone: parsed.data.phone,
              subject: parsed.data.subject,
              message: parsed.data.message,
            },
          });
        } catch {}

        return json({ ok: true, id: data.id }, 200);
      },
    },
  },
});

function json(o: unknown, status: number): Response {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}