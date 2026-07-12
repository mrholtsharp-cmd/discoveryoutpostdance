import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

function isSafeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [{ title: "Authorize app — Discovery Outpost" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
      return data;
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <Layout>
      <section className="mx-auto max-w-md px-6 py-24">
        <Card className="p-8">
          <h1 className="font-display text-2xl">Authorization error</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {String((error as Error)?.message ?? error)}
          </p>
        </Card>
      </section>
    </Layout>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as any;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.client_name ?? details?.client?.name ?? "an app";
  const redirectUri = details?.client?.redirect_uris?.[0] ?? details?.redirect_url ?? details?.redirect_to;
  const scopes: string[] = details?.scopes ?? details?.requested_scopes ?? [];

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message ?? String(error)); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  return (
    <Layout>
      <section className="mx-auto max-w-md px-6 py-24">
        <Card className="p-8 space-y-4">
          <h1 className="font-display text-2xl">Connect {clientName} to your account</h1>
          <p className="text-sm text-muted-foreground">
            This lets <strong>{clientName}</strong> use Discovery Outpost as you. It will be able
            to call this app's enabled tools while you are signed in.
          </p>
          {redirectUri && (
            <p className="text-xs text-muted-foreground break-all">
              Redirect URI: <code>{redirectUri}</code>
            </p>
          )}
          {scopes.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5">
              {scopes.map((s) => <li key={s}>{s}</li>)}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            This does not bypass this app's permissions or backend policies.
          </p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 rounded-full" disabled={busy} onClick={() => decide(true)}>
              {busy ? "Please wait…" : "Approve"}
            </Button>
            <Button variant="outline" className="flex-1 rounded-full" disabled={busy} onClick={() => decide(false)}>
              Cancel connection
            </Button>
          </div>
        </Card>
      </section>
    </Layout>
  );
}

export { isSafeNext };