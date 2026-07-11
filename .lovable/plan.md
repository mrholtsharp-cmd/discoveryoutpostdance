## Current state (verified in the database)

Total invoices: **21**. Distribution:

| Status | Count | Notes |
|---|---|---|
| `new` (draft) | 14 | Admin-only under new workflow |
| `cancelled` | 7 | Should not be payable |
| `sent` / `overdue` / `paid` / `refunded` / `partial_refund` | 0 | None exist |

Every invoice already has: `parent_id`, `parent_email`, `parent_name`, `semester_year`, `semester_label`, `tuition_plan`, `invoice_preference`, `cash_payment`, correct totals, and 1+ line items. **Structurally, all 21 invoices already fit the new workflow.** No replacement invoices are needed; no paid history to preserve; no refunds to protect.

The only real drift from the new workflow is Stripe-link hygiene:

- **7 draft (`new`) invoices** have a `payment_url` populated from before the "Send Invoice = generate link" rule. Under the new workflow drafts must have no Stripe link.
- **3 of those drafts are `cash_payment = true`** (DO-2026-0002, 0003, 0005) and must never have a Stripe link at all.
- **6 `cancelled` invoices** still have a live `payment_url`. Cancelled invoices must not be payable.

Nothing else needs repair, replacement, or archival.

## Plan

Small, admin-gated, idempotent, dry-run-first cleanup — scoped exactly to the drift above.

### 1. Add an admin migration tool: `src/lib/invoice-migration.functions.ts`

Two `createServerFn` handlers, both `requireSupabaseAuth` + `has_role('admin')`:

- `previewInvoiceMigration()` — reads only, returns a categorized report:
  - `compatible[]` — invoice is fine, nothing to do
  - `drafts_with_stale_link[]` — `status='new'`, `payment_url` set → will clear link + expire Stripe session
  - `cash_drafts_with_link[]` — `status='new' AND cash_payment` with any link → will clear link + expire session
  - `cancelled_with_link[]` — `status='cancelled'`, `payment_url` set → will clear link + expire session
  - `paid_preserved[]` — untouched (currently empty)
  - `refunded_preserved[]` — untouched (currently empty)
  - `missing_line_items[]` — invoices with 0 line items (currently empty; flagged for manual review, never auto-created)
  - `missing_parent_link[]` — invoices without `parent_id` (currently empty; flagged for manual review)
  - `duplicates_needing_review[]` — same `parent_id + semester_year + renewal_month + tuition_plan` seen twice among non-cancelled (flagged, never auto-merged)
- `runInvoiceMigration({ confirm: true })` — performs only these edits:
  - For each drift row above: `stripe.checkout.sessions.expire(stripe_session_id)` (best-effort, ignore already-expired) then `UPDATE invoices SET payment_url=NULL, stripe_session_id=NULL, stripe_session_created_at=NULL, stripe_session_expires_at=NULL, updated_at=now()`.
  - Never touches `status`, `total_cents`, `line_items`, `paid_at`, `sent_at`, `stripe_payment_intent_id`, `refunded_amount_cents`, `invoice_number`, `id`, `parent_id`, `notes`.
  - Never sends email, never generates new Stripe links (Admin still clicks **Send Invoice** on a draft, which is where the workflow already creates the link).
  - Records `admin_notes` append: `\n[migrated <ISO>] cleared stale Stripe link (workflow v2)` — used as the idempotency guard so a second run skips already-cleaned rows.
  - Returns a report: `{ links_cleared, sessions_expired, sessions_already_expired, skipped_already_migrated, errors }`.

Idempotency guard: `WHERE payment_url IS NOT NULL AND (status IN ('new','cancelled') OR (status='new' AND cash_payment))`. A second run finds zero rows and reports "already clean".

### 2. Add an admin UI: `src/routes/_authenticated/admin.invoice-migration.tsx`

- Loads the preview.
- Renders each bucket as a table with invoice number, parent, status, total, action ("clear link", "no change", "manual review").
- Footer summary + a **Run migration** button that opens a confirm dialog listing the exact counts to be modified. Disabled if `links_cleared + sessions_expired == 0` (nothing to do).
- After run, shows the result report and offers a link back to Admin → Invoices.
- Linked from the Admin dashboard nav as "Invoice migration" (kept out of the parent portal).

### 3. What the plan explicitly does **not** do

- No `DELETE` on invoices or line items.
- No new invoices created. No replacement/supersede/archive rows (nothing in the current data requires it; the schema has no `superseded_by` column and adding one for zero use cases would be waste).
- No changes to `paid`, `refunded`, `partial_refund`, `sent`, `overdue` invoices — the fixed webhook + refund handlers already handle those and none exist yet.
- No re-emailing. No auto-Send.
- No schema migration.

### 4. Verification

- `bunx tsgo --noEmit`.
- Run the preview against the live DB via `invoke-server-function`; confirm counts match the table above (7 drafts w/ link, 6 cancelled w/ link, 3 cash overlap).
- Run the migration once → verify: cancelled invoices show no `payment_url`, drafts show no `payment_url`, `admin_notes` carries the marker.
- Run it a second time → verify report shows `links_cleared: 0, skipped_already_migrated: N`.

## Files

- **New:** `src/lib/invoice-migration.functions.ts`
- **New:** `src/routes/_authenticated/admin.invoice-migration.tsx`
- **Edit:** `src/routes/_authenticated/admin.tsx` — add nav card/link to the migration page.

Nothing else changes.