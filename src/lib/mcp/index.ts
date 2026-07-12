import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyAccount from "./tools/get-my-account";
import listMyInvoices from "./tools/list-my-invoices";
import listClasses from "./tools/list-classes";

// The OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "discovery-outpost-dance-mcp",
  title: "Discovery Outpost Dance",
  version: "0.1.0",
  instructions:
    "Tools for parents of Discovery Outpost Performing Arts Dance. Use `get_my_account` to view your parent profile, students, and enrollments; `list_my_invoices` to review invoices and balances; `list_classes` to browse the current schedule.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyAccount, listMyInvoices, listClasses],
});