import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/account", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      toast.success("Password reset email sent — check your inbox.");
      setMode("signin");
      return;
    }
    if (mode === "signup") {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/account` },
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      // If email confirmation is required there's no session yet — tell the
      // user instead of bouncing them to /account where the auth gate kicks
      // them straight back here.
      if (!signUpData.session) {
        toast.success("Account created — check your email to confirm, then sign in.");
        setMode("signin");
        return;
      }
      toast.success("Account created — you're signed in.");
      navigate({ to: "/account", replace: true });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/account", replace: true });
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