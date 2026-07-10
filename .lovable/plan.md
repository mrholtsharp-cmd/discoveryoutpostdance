# Safe Production Cleanup + Invoice Workflow Upgrade

This is a large, cross-cutting change. I'll do it in **6 verified batches**, stopping between each to confirm nothing regressed. No DB records deleted, no schema drops, no changes to auth/RLS/Stripe webhook signature verification.

---

## Batch 1 — Registration → auto-create Draft invoice

**Files:** `src/lib/registrations.functions.ts`, `src/lib/registration-v2.functions.ts`

- After a successful registration commit, create an invoice with `status = 'new'` (Draft), line items for **enrolled** classes only (skip `waitlist_entries`).
- Idempotency key: `registration-{registration_id}` so re-runs never duplicate.
- Do **not** call Stripe, do **not** send email. Admin must click Send Invoice.
- If invoice creation fails, log it and continue — never block registration.

**Verify:** Run a test registration in Playwright, confirm Draft invoice appears in `admin.invoices` and no email fires.

---

## Batch 2 — Parent Portal: remove "Request Invoice"

**Files:** `src/routes/_authenticated/account.tsx` (+ any `invoice-requests` UI hook)

- Hide the Request Invoice button/section in Parent Portal.
- Leave `invoice_requests` table + admin page intact (no data loss) — just unlink from parent nav.

**Verify:** Load `/account` — no Request Invoice CTA.

---

## Batch 3 — Payment method enforcement (cash vs. Stripe)

**Files:** `src/lib/payments.functions.ts`, `src/lib/invoices.functions.ts` (sendInvoice), parent portal invoice view.

- On **Send Invoice**: if `cash_payment = true`, skip Stripe link creation entirely; email includes cash/Venmo/CashApp/PayPal instructions only.
- If not cash: generate Stripe Checkout link, save on invoice, include Pay Online in email + portal.
- Parent portal invoice card: only shows Pay Online when `status IN ('sent','overdue','partial')` **and** `cash_payment = false` **and** `payment_url` exists. Cash invoices show payment instructions block, no Stripe button.

**Verify:** Create one cash + one card draft, send both, confirm portal shows correct affordance.

---

## Batch 4 — Monthly tuition guardrails

**Files:** `src/lib/monthly-invoices.functions.ts`

- Already filters `status = 'active'` enrollments ✅
- Already uses `idempotency_key = monthly-{parent}-{YYYY-MM}` ✅
- Confirm renewal invoices start `status = 'new'` (Draft) ✅
- Add: skip parents with **zero active enrollments** (already done) and add explicit log line for admin dashboard.

**Verify:** Run `runMonthlyRenewalManually` twice, second run reports all deduped.

---

## Batch 5 — Backfill/sync tool

**Files:** `src/lib/invoices.functions.ts` (extend existing `backfillMissingInvoices`), `src/routes/_authenticated/admin.invoices.tsx`.

- Scan `registrations` where no invoice exists with `idempotency_key = registration-{id}`.
- Skip registrations whose students are only on `waitlist_entries` (no `enrollments.status='active'` row).
- Create Draft invoice + line items. **Do not** pre-generate Stripe link (link is created at Send time — matches Batch 3).
- Return `{ created, skipped_waitlist_only, skipped_existing, failed }`.
- Admin UI: rename button "Sync missing invoices", show result counts.

**Verify:** Run once → counts. Run again → all skipped_existing.

---

## Batch 6 — Admin Dashboard cleanup

**Files:** `src/routes/_authenticated/admin.tsx` (nav), possibly `admin.index.tsx`.

Keep: Registrations, Students, Classes, Attendance, Invoices, Parents/Messages, Monthly Tuition, Waitlists, Teachers, Contact.

Hide from nav (do not delete files/routes):
- **Invoice Requests** (parents no longer request) — route stays reachable by URL for legacy review, removed from nav.
- Any test/demo invoice buttons on `admin.index.tsx` if present.

**Verify:** Load admin, screenshot nav.

---

## Final verification (Playwright)

1. New registration → Draft invoice in Admin, no email.
2. Admin Send → parent sees Pay Online (card) or instructions (cash).
3. Cash invoice has no `payment_url`.
4. Non-cash invoice has Stripe link after Send.
5. Backfill run twice → no duplicates.
6. Monthly renewal run twice → no duplicates.
7. Stripe webhook flips `status → paid` (existing behavior, unchanged).

---

## Guardrails

- **No** schema migrations unless a batch discovers a missing column — I'll pause and ask.
- **No** changes to `src/routes/api/public/stripe/webhook.ts` signature/verification logic.
- **No** changes to auth, RLS, `user_roles`, or `_authenticated/route.tsx`.
- **No** deletion of tables, columns, or rows.
- After each batch: `bunx tsgo --noEmit` + targeted Playwright check.
- If any regression appears, I stop and report before continuing.

Approve to start with Batch 1.
