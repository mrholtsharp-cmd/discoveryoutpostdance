import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X, Shield } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentUserAdmin } from "@/lib/admin-v2.functions";

const nav = [
  { to: "/", label: "Home" },
  { to: "/schedule", label: "Schedule" },
  { to: "/tuition", label: "Tuition" },
  { to: "/register", label: "Register" },
  { to: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    async function refresh(hasSession: boolean) {
      setSignedIn(hasSession);
      if (hasSession) {
        try { setIsAdmin(await isCurrentUserAdmin()); } catch { setIsAdmin(false); }
      } else {
        setIsAdmin(false);
      }
    }
    supabase.auth.getSession().then(({ data }) => refresh(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => refresh(!!session));
    return () => sub.subscription.unsubscribe();
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
          {isAdmin && (
            <Button asChild size="sm" variant="ghost" className="rounded-full px-3 text-primary">
              <Link to="/admin"><Shield className="h-4 w-4" /> Admin</Link>
            </Button>
          )}
          {signedIn ? (
            <Button asChild size="sm" variant="outline" className="rounded-full px-5">
              <Link to="/account">My Account</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-full px-5">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
          <Button asChild size="sm" className="rounded-full px-5">
            <Link to="/register">Enroll</Link>
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
            {isAdmin && (
              <Link to="/admin" onClick={() => setOpen(false)} className="text-base font-display text-primary">
                Admin Dashboard
              </Link>
            )}
            <Button asChild className="rounded-full mt-2">
              <Link to="/register" onClick={() => setOpen(false)}>Register Now</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}