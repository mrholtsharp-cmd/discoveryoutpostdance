import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign In — Discovery Outpost" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: AuthPage,
});

function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const nextPath = safeNext(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (nextPath) window.location.assign(nextPath);
        else navigate({ to: "/account", replace: true });
      }
    });
  }, [navigate, nextPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // prevent duplicate submits
    setLoading(true);

    const isDev = import.meta.env.DEV;
    const mark = (label: string, start: number) => {
      if (isDev) console.log(`[auth] ${label} ${(performance.now() - start).toFixed(0)}ms`);
    };
    const devToast = (msg: string) => { if (isDev) toast.message(msg); };

    const normalizedEmail = email.trim().toLowerCase();

    try {
      if (mode === "forgot") {
        const t = performance.now();
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        mark("resetPasswordForEmail", t);
        if (error) throw error;
        toast.success("Password reset email sent — check your inbox.");
        setMode("signin");
        return;
      }

      if (mode === "signup") {
        const t = performance.now();
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${nextPath ?? "/account"}`,
          },
        });
        mark("signUp", t);
        if (error) throw error;
        if (!signUpData.session) {
          toast.success("Account created — check your email to confirm, then sign in.");
          setMode("signin");
          return;
        }
        toast.success("Account created — you're signed in.");
        await goToAccount();
        return;
      }

      devToast("Signing in");
      const tSignIn = performance.now();
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      mark("signInWithPassword", tSignIn);
      if (error) throw error;
      if (!signInData.session) throw new Error("Sign-in returned no session.");

      devToast("Auth success");
      toast.success("Welcome back");
      await goToAccount();
    } catch (err: any) {
      const message = err?.message || "Something went wrong. Please try again.";
      toast.error(message);
      if (isDev) console.error("[auth] submit error", err);
    } finally {
      // Only clear loading if we're still on the auth page (navigation may have unmounted us)
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/auth")) {
        setLoading(false);
      }
    }

    async function goToAccount() {
      devToast("Navigating");
      const tNav = performance.now();
      try {
        if (nextPath) {
          window.location.assign(nextPath);
          return;
        }
        await navigate({ to: "/account", replace: true });
        mark("navigate", tNav);
      } catch (navErr) {
        if (isDev) console.error("[auth] navigate failed, falling back", navErr);
        window.location.assign(nextPath ?? "/account");
      }
    }
  }

  return (
    <Layout>
      <section className="mx-auto max-w-md px-6 py-24">
        <Card className="p-8">
          <h1 className="font-display text-3xl">
            {mode === "forgot" ? "Reset Password" : mode === "signup" ? "Create Account" : "Sign In"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "Enter your email and we'll send a password reset link."
              : mode === "signup"
              ? "Create a parent/student account to enroll and pay tuition."
              : "Sign in to enroll, pay tuition, or manage your account."}
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            <Button type="submit" className="w-full rounded-full" disabled={loading}>
              {loading ? "Please wait..." : mode === "forgot" ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              {mode === "signin" && (
                <>
                  <button type="button" className="underline hover:text-foreground" onClick={() => setMode("signup")}>
                    New here? Create an account
                  </button>
                  <button type="button" className="underline hover:text-foreground" onClick={() => setMode("forgot")}>
                    Forgot password?
                  </button>
                </>
              )}
              {mode === "signup" && (
                <button type="button" className="underline hover:text-foreground" onClick={() => setMode("signin")}>
                  Have an account? Sign in
                </button>
              )}
              {mode === "forgot" && (
                <button type="button" className="underline hover:text-foreground" onClick={() => setMode("signin")}>
                  Back to sign in
                </button>
              )}
            </div>
          </form>
        </Card>
      </section>
    </Layout>
  );
}