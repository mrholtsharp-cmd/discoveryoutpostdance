import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/attire-guide")({
  head: () => ({
    meta: [
      { title: "What to Wear to Your First Dance Class — Discovery Outpost" },
      { name: "description", content: "A beginner-friendly guide to dance attire and shoes for Ballet, Jazz, Tap, and Musical Theater classes." },
      { property: "og:title", content: "What to Wear to Your First Dance Class" },
      { property: "og:description", content: "Clothing and footwear essentials for Ballet, Jazz, Tap, and Musical Theater." },
      { property: "og:url", content: "https://discoveryoutpost.dance/attire-guide" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "https://discoveryoutpost.dance/attire-guide" }],
  }),
  component: AttireGuidePage,
});

function AttireGuidePage() {
  const disciplines = [
    {
      name: "Ballet",
      clothing: "Fitted leotard (any color) with pink or skin-tone tights. Hair pulled back into a secure bun. No baggy clothing — instructors need to see body alignment.",
      shoes: "Full-sole or split-sole leather ballet slippers in pink (for girls) or black/white (for boys). No pointe shoes until approved by an instructor.",
    },
    {
      name: "Jazz",
      clothing: "Form-fitting tank or t-shirt with leggings, jazz pants, or fitted shorts. Hair tied back. Layers are fine for warm-up but should come off for class.",
      shoes: "Slip-on jazz shoes in black or tan. Sneakers are not a substitute — jazz shoes allow proper turns and pointing.",
    },
    {
      name: "Tap",
      clothing: "Comfortable, fitted athletic wear — leggings or jazz pants and a fitted top. Avoid wide-leg pants that hide footwork.",
      shoes: "Tap shoes with secured metal taps. Beginners can start with slip-on or Mary Jane styles; advanced dancers may use oxford-style tap shoes.",
    },
    {
      name: "Musical Theater",
      clothing: "Movement-friendly clothing you can dance, sing, and act in — leggings or jazz pants with a fitted top. Bring water and a notebook.",
      shoes: "Jazz shoes or character shoes (low-heeled, T-strap). Sneakers are okay for some choreography but jazz shoes are preferred.",
    },
  ];

  return (
    <Layout>
      <article className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-xs uppercase tracking-[0.25em] text-primary">Beginner Guide</span>
        <h1 className="font-display text-5xl sm:text-6xl mt-4">What to Wear to Your First Dance Class</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          New to dance? The right attire helps you move freely, lets your instructor see your alignment,
          and keeps you safe. Here's exactly what to wear for each style we teach at Discovery Outpost.
        </p>

        <section className="mt-12 space-y-6">
          {disciplines.map((d) => (
            <Card key={d.name} className="p-6">
              <h2 className="font-display text-2xl">{d.name}</h2>
              <div className="mt-4 space-y-3 text-sm">
                <p><span className="font-semibold">Clothing:</span> {d.clothing}</p>
                <p><span className="font-semibold">Shoes:</span> {d.shoes}</p>
              </div>
            </Card>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="font-display text-3xl">General Tips for Every Class</h2>
          <ul className="mt-4 space-y-2 text-muted-foreground list-disc pl-6">
            <li>Arrive 10 minutes early to change and stretch.</li>
            <li>Skip jewelry — necklaces, dangly earrings, and bracelets can catch or distract.</li>
            <li>Bring a labeled water bottle.</li>
            <li>Avoid heavy lotion or perfume before class.</li>
            <li>If you're unsure about shoes, come in socks for the first class and we'll help you choose.</li>
          </ul>
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button asChild className="rounded-full"><Link to="/register">Register for a Class</Link></Button>
          <Button asChild variant="outline" className="rounded-full"><Link to="/schedule">See the Schedule</Link></Button>
        </div>
      </article>
    </Layout>
  );
}