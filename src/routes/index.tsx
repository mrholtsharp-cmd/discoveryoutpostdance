import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layout } from "@/components/site/Layout";
import { Logo } from "@/components/site/Logo";
import { ImagePlaceholder } from "@/components/site/ImagePlaceholder";
import { listSchedule } from "@/lib/schedule.functions";
import { Check, Sparkles, Music2, Star, Phone, Mail, MapPin, Instagram, Facebook } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Discovery Outpost Performing Arts Dance — Tap, Jazz & Ballet" },
      { name: "description", content: "Dance studio offering Tap, Jazz, Ballet, and Musical Theater classes for all ages and skill levels. Where confidence meets movement." },
      { property: "og:title", content: "Discovery Outpost Performing Arts Dance" },
      { property: "og:description", content: "Tap, Jazz, Ballet, and Musical Theater classes for all ages and skill levels." },
      { property: "og:url", content: "/" },
    ],
    links: [
      { rel: "canonical", href: "/" },
      { rel: "preload", as: "image", href: logoAsset.url, fetchPriority: "high" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <Layout>
      <Hero />
      <Stats />
      <About />
      <Classes />
      <SchedulePreview />
      <RegisterCTA />
      <Gallery />
      <Testimonials />
      <WhyChooseUs />
      <Contact />
    </Layout>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Logo painted first (deepest layer) so the pink color washes over it */}
      <div className="absolute inset-0 -z-20 flex items-center justify-center pointer-events-none" aria-hidden>
        <Logo className="h-[420px] w-[420px] md:h-[680px] md:w-[680px] opacity-60 animate-float-slow" priority />
      </div>
      {/* Pink color overlay sits on top of the logo */}
      <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-accent/70 via-accent/30 to-background" />
        <div className="absolute -top-20 -right-20 h-[500px] w-[500px] rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, #E88AB0 0%, transparent 70%)" }} />
      </div>
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-20 md:pt-32 md:pb-28">
        <div className="max-w-2xl animate-fade-up">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary mb-6">
            <Sparkles className="h-3 w-3" /> Discovery Outpost Performing Arts Dance
          </span>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl leading-[1.05]">
            Where Confidence<br/>
            <em className="italic font-light text-primary">Meets Movement</em>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-lg leading-relaxed">
            Tap, Jazz, Ballet, and Musical Theater classes for all ages and skill levels.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Button asChild size="lg" className="rounded-full px-8 h-12 text-base">
              <Link to="/register">Register Now</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-8 h-12 text-base border-foreground/20">
              <Link to="/schedule">View Class Schedule</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const items = [
    "Beginner to Advanced Classes",
    "Ages 3+",
    "Experienced Instructors",
    "Performance Opportunities",
  ];
  return (
    <section className="border-y border-border bg-accent/15">
      <div className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {items.map((t) => (
          <div key={t} className="text-sm md:text-base font-display tracking-wide">
            {t}
          </div>
        ))}
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
      <ImagePlaceholder label="Studio" aspect="aspect-[4/5]" />
      <div>
        <span className="text-xs uppercase tracking-[0.25em] text-primary">About the Studio</span>
        <h2 className="font-display text-4xl sm:text-5xl mt-4 leading-tight">
          A welcoming home for dancers.
        </h2>
        <p className="mt-6 text-muted-foreground leading-relaxed">
          Discovery Outpost is a dance environment built on technique, confidence,
          discipline, and creativity. Our students grow as artists and as people —
          guided by experienced instructors who care about every step of the journey.
        </p>
        <ul className="mt-8 space-y-3">
          {[
            "Strong technical foundation",
            "Positive learning environment",
            "Performance training",
            "Beginner-friendly to advanced levels",
          ].map((t) => (
            <li key={t} className="flex items-start gap-3">
              <span className="mt-1 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                <Check className="h-3 w-3 text-primary" />
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const classData = [
  { name: "Ballet", desc: "Classical technique, grace, posture, and discipline." },
  { name: "Jazz", desc: "High-energy movement, rhythm, flexibility, and performance." },
  { name: "Tap", desc: "Rhythm, musicality, coordination, and timing." },
  { name: "Musical Theater", desc: "Acting, singing, and dance fused into stage-ready performance." },
];

function Classes() {
  return (
    <section className="bg-accent/15 border-y border-border">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-[0.25em] text-primary">Our Classes</span>
          <h2 className="font-display text-4xl sm:text-5xl mt-4">Four disciplines. One studio.</h2>
        </div>
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {classData.map((c) => (
            <Card key={c.name} className="overflow-hidden border-border bg-background hover-lift p-0">
              <ImagePlaceholder label={c.name} aspect="aspect-[4/5]" className="rounded-none rounded-t-2xl" />
              <div className="p-6">
                <h3 className="font-display text-2xl">{c.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function SchedulePreview() {
  const { data } = useQuery({ queryKey: ["schedule"], queryFn: () => listSchedule() });
  const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const byDay = (data ?? []).reduce<Record<string, typeof data>>((acc, row) => {
    (acc[row.day] ||= [] as any).push(row);
    return acc;
  }, {} as any);
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <span className="text-xs uppercase tracking-[0.25em] text-primary">Weekly Schedule</span>
          <h2 className="font-display text-4xl sm:text-5xl mt-4">This week's classes</h2>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/schedule">Full schedule</Link>
        </Button>
      </div>
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {dayOrder.filter((d) => byDay[d]).map((day) => (
          <Card key={day} className="p-6 border-border hover-lift">
            <div className="font-display text-xl">{day}</div>
            <ul className="mt-4 space-y-2 text-sm">
              {byDay[day]?.map((row) => (
                <li key={row.id} className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
                  <span>{row.class_name}</span>
                  <span className="text-muted-foreground">{row.time}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}

function RegisterCTA() {
  return (
    <section className="mx-auto max-w-6xl px-6">
      <div className="rounded-3xl px-8 py-16 md:p-16 text-center"
           style={{ background: "linear-gradient(135deg, #F7C6D9 0%, #E88AB0 100%)" }}>
        <h2 className="font-display text-4xl sm:text-5xl text-foreground max-w-2xl mx-auto leading-tight">
          Find your rhythm. Join our next session.
        </h2>
        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <Button asChild size="lg" className="rounded-full px-8 h-12 bg-foreground text-background hover:bg-foreground/90">
            <Link to="/register">Register Now</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-8 h-12 bg-background/40 backdrop-blur border-foreground/30">
            <Link to="/register" search={{ trial: true } as any}>Book a Trial Class</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Gallery() {
  const tiles = [
    { label: "Ballet", aspect: "aspect-square" },
    { label: "Pointe", aspect: "aspect-[4/5]" },
    { label: "Jazz", aspect: "aspect-[4/5]" },
    { label: "Tap", aspect: "aspect-square" },
    { label: "Rehearsal", aspect: "aspect-square" },
    { label: "Performance", aspect: "aspect-[4/5]" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="text-center max-w-2xl mx-auto">
        <span className="text-xs uppercase tracking-[0.25em] text-primary">Gallery</span>
        <h2 className="font-display text-4xl sm:text-5xl mt-4">Moments in motion</h2>
      </div>
      <div className="mt-14 grid grid-cols-2 md:grid-cols-3 gap-4">
        {tiles.map((t, i) => (
          <ImagePlaceholder key={i} {...t} />
        ))}
      </div>
    </section>
  );
}

const testimonials = [
  { q: "My child's confidence has grown so much.", a: "— Parent" },
  { q: "Amazing instructors and a very welcoming studio.", a: "— Parent" },
  { q: "Quality training with a supportive environment.", a: "— Student" },
];

function Testimonials() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % testimonials.length), 5000);
    return () => clearInterval(id);
  }, []);
  const t = testimonials[i];
  return (
    <section className="bg-accent/15 border-y border-border">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Star className="h-6 w-6 text-primary mx-auto" />
        <blockquote key={i} className="mt-6 font-display text-3xl sm:text-4xl leading-tight animate-fade-up">
          "{t.q}"
        </blockquote>
        <div className="mt-6 text-sm text-muted-foreground">{t.a}</div>
        <div className="mt-8 flex justify-center gap-2">
          {testimonials.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Show testimonial ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-8 bg-primary" : "w-2 bg-foreground/20"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyChooseUs() {
  const items = [
    "Instruction in Tap, Jazz, Ballet, and Musical Theater",
    "Beginner to Advanced Programs",
    "Performance Opportunities",
    "Confidence & Discipline Focus",
    "Friendly, Supportive Environment",
  ];
  return (
    <section className="mx-auto max-w-4xl px-6 py-24 text-center">
      <span className="text-xs uppercase tracking-[0.25em] text-primary">Why Choose Us</span>
      <h2 className="font-display text-4xl sm:text-5xl mt-4">A studio you can trust.</h2>
      <ul className="mt-12 grid sm:grid-cols-2 gap-4 text-left">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-3 p-5 rounded-xl border border-border bg-background hover-lift">
            <span className="mt-1 h-5 w-5 rounded-full bg-accent flex items-center justify-center shrink-0">
              <Check className="h-3 w-3 text-primary" />
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="mx-auto max-w-6xl px-6 py-24 grid md:grid-cols-2 gap-12">
      <div>
        <span className="text-xs uppercase tracking-[0.25em] text-primary">Visit Us</span>
        <h2 className="font-display text-4xl sm:text-5xl mt-4">Come dance with us.</h2>
        <ul className="mt-8 space-y-4 text-sm">
          <li className="flex items-start gap-3"><Phone className="h-4 w-4 mt-1 text-primary"/><span>(555) 123-4567</span></li>
          <li className="flex items-start gap-3"><Mail className="h-4 w-4 mt-1 text-primary"/><span>hello@discoveryoutpost.dance</span></li>
          <li className="flex items-start gap-3"><MapPin className="h-4 w-4 mt-1 text-primary"/><span>123 Studio Way, Your City, ST 00000</span></li>
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="rounded-full"><a href="tel:5551234567">Call Now</a></Button>
          <Button asChild variant="outline" className="rounded-full"><Link to="/register">Register Today</Link></Button>
          <Button asChild variant="outline" className="rounded-full"><Link to="/register">Schedule a Trial</Link></Button>
        </div>
        <div className="mt-8 flex gap-4">
          <a href="#" aria-label="Instagram" className="p-2 rounded-full border border-border hover:border-primary hover:text-primary"><Instagram className="h-4 w-4" /></a>
          <a href="#" aria-label="Facebook" className="p-2 rounded-full border border-border hover:border-primary hover:text-primary"><Facebook className="h-4 w-4" /></a>
          <a href="#" aria-label="TikTok" className="p-2 rounded-full border border-border hover:border-primary hover:text-primary"><Music2 className="h-4 w-4" /></a>
        </div>
      </div>
      <div className="rounded-2xl overflow-hidden border border-border min-h-[360px]">
        <iframe
          title="Studio map"
          src="https://www.google.com/maps?q=dance+studio&output=embed"
          width="100%"
          height="100%"
          loading="lazy"
          style={{ border: 0, minHeight: 360 }}
        />
      </div>
    </section>
  );
}
