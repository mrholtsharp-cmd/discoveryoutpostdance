import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({ meta: [{ title: "Payment Complete — Discovery Outpost" }, { name: "robots", content: "noindex" }] }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  return (
    <Layout>
      <section className="mx-auto max-w-md px-6 py-24">
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 font-display text-3xl">
            {session_id ? "Payment complete!" : "No payment info found"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session_id
              ? "Thank you. A receipt has been emailed to you. Your enrollment is active."
              : "We couldn't find your checkout session. If you were charged, contact the studio."}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild><Link to="/account">View My Account</Link></Button>
            <Button asChild variant="outline"><Link to="/">Home</Link></Button>
          </div>
        </Card>
      </section>
    </Layout>
  );
}