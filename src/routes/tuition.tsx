import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BUSINESS, REGISTRATION_FEE_CENTS, RECITAL_FEE_CENTS, CASH_DISCOUNT_PER_CLASS_CENTS, SEMESTER_MONTHS, centsToUSD } from "@/lib/business";

export const Route = createFileRoute("/tuition")({
  head: () => ({
    meta: [
      { title: "Tuition & Fees — Discovery Outpost" },
      { name: "description", content: "Monthly tuition, semester tuition, and one-time fees for Discovery Outpost dance classes." },
    ],
  }),
  component: TuitionPage,
});

const MONTHLY_35 = [
  "Dance (Ages 3–5)", "Dance (Ages 5–6)", "Dance (Ages 7–10)",
  "Dance (Ages 10–14)", "Dance (Ages 14–18)",
];
const MONTHLY_30 = [
  "Junior Musical Theater Dance (Ages 8–12)",
  "Teen Musical Theater Dance (Ages 12–18)",
  "Boys Tap", "Women's Jazz", "Women's Tap",
];

function TuitionPage() {
  return (
    <Layout>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-display text-4xl">Tuition & Fees</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Choose monthly or semester tuition during registration. Your invoice is generated automatically after you enroll — no online payment required. Pay by cash, Cash App, Venmo, PayPal, or Stripe when available.
        </p>

        <div className="mt-6 flex gap-3 flex-wrap">
          <Button asChild className="rounded-full">
            <Link to="/register">Register now</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/account">Parent portal</Link>
          </Button>
        </div>

        <h2 className="mt-12 font-display text-2xl">Monthly Tuition (4 months)</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {MONTHLY_35.map((n) => <PriceCard key={n} name={n} price="$35/mo" />)}
          {MONTHLY_30.map((n) => <PriceCard key={n} name={n} price="$30/mo" />)}
        </div>

        <h2 className="mt-12 font-display text-2xl">Semester Tuition (one payment)</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {MONTHLY_35.map((n) => <PriceCard key={n} name={n} price="$140" />)}
          {MONTHLY_30.map((n) => <PriceCard key={n} name={n} price="$120" />)}
        </div>

        <h2 className="mt-12 font-display text-2xl">Fees & Discounts</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <PriceCard name="Registration Fee" price={centsToUSD(REGISTRATION_FEE_CENTS)} desc="Once per student per semester." />
          <PriceCard name="Recital Fee" price={centsToUSD(RECITAL_FEE_CENTS)} desc="Once per student." />
          <PriceCard name="Cash Discount" price={`−${centsToUSD(CASH_DISCOUNT_PER_CLASS_CENTS)} / class`} desc={`When you select "Pay Cash at the Studio" during registration.`} />
        </div>

        <Card className="mt-12 p-5 bg-muted/30">
          <h3 className="font-display text-lg">How billing works</h3>
          <ul className="mt-2 text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>Registration automatically generates an invoice with all applicable fees.</li>
            <li>Choose monthly or semester tuition and whether to receive monthly or one semester invoice.</li>
            <li>Pay by cash (at the studio), Cash App ($DOPAdance), Venmo (@DOPADance), PayPal ({BUSINESS.email}), or Stripe when a link is provided.</li>
            <li>Registration fee is charged once per student per semester; recital fee is charged once per student.</li>
          </ul>
        </Card>

        <div className="mt-6">
          <PaymentMethods hideStripe variant="full" />
        </div>
      </section>
    </Layout>
  );
}

function PriceCard({ name, price, desc }: { name: string; price: string; desc?: string }) {
  return (
    <Card className="p-6 flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg">{name}</h3>
        <span className="text-lg font-semibold whitespace-nowrap">{price}</span>
      </div>
      {desc && <p className="mt-2 text-sm text-muted-foreground flex-1">{desc}</p>}
    </Card>
  );
}