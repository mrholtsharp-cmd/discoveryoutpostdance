import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Home" },
  { to: "/schedule", label: "Schedule" },
  { to: "/register", label: "Register" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/90 backdrop-blur border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="h-12 w-12 rounded-full overflow-hidden transition-transform group-hover:scale-105">
            <Logo className="h-full w-full object-cover" />
          </div>
          <span className="font-display text-base sm:text-lg leading-tight">
            Discovery Outpost
            <span className="hidden sm:inline text-muted-foreground font-sans text-xs tracking-widest uppercase ml-2">
              Performing Arts Dance
            </span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-sm tracking-wide text-foreground/80 hover:text-primary transition-colors"
              activeProps={{ className: "text-primary" }}
            >
              {n.label}
            </Link>
          ))}
          <Button asChild size="sm" className="rounded-full px-5">
            <Link to="/register">Register Now</Link>
          </Button>
        </nav>
        <button
          aria-label="Toggle menu"
          className="md:hidden p-2 -mr-2"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-6 py-6 flex flex-col gap-4">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="text-base font-display"
              >
                {n.label}
              </Link>
            ))}
            <Button asChild className="rounded-full mt-2">
              <Link to="/register" onClick={() => setOpen(false)}>Register Now</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}