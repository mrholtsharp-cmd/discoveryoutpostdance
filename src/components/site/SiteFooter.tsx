import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Music2, Phone, Mail, MapPin } from "lucide-react";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-accent/20 mt-24">
      <div className="mx-auto max-w-6xl px-6 py-16 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full overflow-hidden">
              <Logo className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="font-display text-xl">Discovery Outpost</div>
              <div className="text-xs tracking-widest uppercase text-muted-foreground">
                Performing Arts Dance
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-muted-foreground max-w-sm leading-relaxed">
            Where confidence meets movement. Training in Tap, Jazz, Ballet, and Musical Theater
            for all ages and skill levels.
          </p>
          <div className="mt-6 flex gap-4">
            <a href="#" aria-label="Instagram" className="p-2 rounded-full border border-border hover:border-primary hover:text-primary transition">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Facebook" className="p-2 rounded-full border border-border hover:border-primary hover:text-primary transition">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="#" aria-label="TikTok" className="p-2 rounded-full border border-border hover:border-primary hover:text-primary transition">
              <Music2 className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div>
          <h3 className="font-display text-sm uppercase tracking-widest mb-4">Explore</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/" className="hover:text-primary">Home</Link></li>
            <li><Link to="/schedule" className="hover:text-primary">Class Schedule</Link></li>
            <li><Link to="/register" className="hover:text-primary">Registration</Link></li>
            <li><Link to="/auth" className="hover:text-primary">Studio Login</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-display text-sm uppercase tracking-widest mb-4">Contact</h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><Phone className="h-4 w-4 mt-0.5 text-primary"/> (555) 123-4567</li>
            <li className="flex items-start gap-2"><Mail className="h-4 w-4 mt-0.5 text-primary"/> hello@discoveryoutpost.dance</li>
            <li className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-primary"/> 123 Studio Way<br/>Your City, ST 00000</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Discovery Outpost Performing Arts Dance. All rights reserved.
      </div>
    </footer>
  );
}