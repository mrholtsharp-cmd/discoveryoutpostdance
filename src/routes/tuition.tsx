import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listTuitionItems } from "@/lib/tuition.functions";

export const Route = createFileRoute("/tuition")({
  head: () => ({
    meta: [
      { title: "Tuition & Fees — Discovery Outpost" },
      { name: "description", content: "Monthly tuition, semester tuition, and one-time fees for Discovery Outpost dance classes." },
    ],
  }),
  component: TuitionPage,
});

type TuitionRow = {
  id: string;
  kind: string;
  name: string;
  display_price: string;
  description: string;
  active: boolean;
};

function TuitionPage() {
  const items = useQuery({ queryKey: ["tuition-items"], queryFn: () => listTuitionItems() });
  const all = ((items.data ?? []) as TuitionRow[]).filter((r) => r.active);
  const monthlyClasses = all.filter((r) => r.kind === "class_monthly");
  const semesterClasses = all.filter((r) => r.kind === "class_semester");
  const oneTime = all.filter((r) => r.kind === "one_time");

  return (
    <Layout>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-display text-4xl">Tuition & Fees</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Register your student, and the studio will send you an invoice for tuition and fees.
          You don't need to pay online — after you register, submit an invoice request and we'll
          email you a bill.
        </p>

        <div className="mt-6 flex gap-3 flex-wrap">
          <Button asChild className="rounded-full">
            <Link to="/register">Register &amp; request invoice</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/account">Parent portal</Link>
          </Button>
        </div>

        {monthlyClasses.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-2xl">Monthly Tuition</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {monthlyClasses.map((r) => (
                <Card key={r.id} className="p-6 flex flex-col">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display text-xl">{r.name}</h3>
                    <span className="text-xl font-semibold">{r.display_price}</span>
                  </div>
                  {r.description && <p className="mt-2 text-sm text-muted-foreground flex-1">{r.description}</p>}
                </Card>
              ))}
            </div>
          </>
        )}

        {semesterClasses.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-2xl">Semester Tuition</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {semesterClasses.map((r) => (
                <Card key={r.id} className="p-6 flex flex-col">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display text-xl">{r.name}</h3>
                    <span className="text-xl font-semibold">{r.display_price}</span>
                  </div>
                  {r.description && <p className="mt-2 text-sm text-muted-foreground flex-1">{r.description}</p>}
                </Card>
              ))}
            </div>
          </>
        )}

        {oneTime.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-2xl">One-time Fees</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {oneTime.map((r) => (
                <Card key={r.id} className="p-6 flex flex-col">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-display text-lg">{r.name}</h3>
                    <span className="text-lg font-semibold">{r.display_price}</span>
                  </div>
                  {r.description && <p className="mt-2 text-sm text-muted-foreground flex-1">{r.description}</p>}
                </Card>
              ))}
            </div>
          </>
        )}

        {items.isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

        <Card className="mt-12 p-5 bg-muted/30">
          <h3 className="font-display text-lg">How billing works</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            After you register, the studio reviews your invoice request and emails you a bill.
            You can pay by check, cash, or however you've arranged with the studio. No card is
            required to complete registration.
          </p>
        </Card>
      </section>
    </Layout>
  );
}