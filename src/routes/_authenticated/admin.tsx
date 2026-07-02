import { createFileRoute, Outlet, Link, useRouterState, useNavigate, redirect } from "@tanstack/react-router";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { isCurrentUserAdmin } from "@/lib/admin-v2.functions";

const TABS: Array<{ to: string; label: string }> = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/parents", label: "Parents" },
  { to: "/admin/classes", label: "Classes" },
  { to: "/admin/registrations", label: "Registrations" },
  { to: "/admin/invoices", label: "Invoices" },
  { to: "/admin/messages", label: "Messages" },
  { to: "/admin/contact", label: "Contact" },
  { to: "/admin/attendance", label: "Attendance" },
  { to: "/admin/waitlists", label: "Waitlists" },
  { to: "/admin/teachers", label: "Teachers" },
  { to: "/admin/tuition", label: "Tuition" },
];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Discovery Outpost" }] }),
  beforeLoad: async () => {
    const ok = await isCurrentUserAdmin();
    if (!ok) throw redirect({ to: "/account" });
  },
  component: AdminShell,
});

function AdminShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Layout>
      <div className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">Studio Admin</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-xs">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 overflow-x-auto">
          <ul className="flex gap-1 min-w-max">
            {TABS.map((t) => {
              const active = t.to === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(t.to);
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    className={`inline-flex items-center px-3 py-2 text-sm border-b-2 whitespace-nowrap transition ${
                      active ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <Outlet />
    </Layout>
  );
}