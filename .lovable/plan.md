# Discovery Outpost Dance — Invoice & Payment Master Spec

Status: **Spec only.** No code changes have been made from this document. Work through sections one at a time in later turns, patching only what's verified broken.

## Guiding rules (do no harm)

- Stability update, not a redesign.
- Do not rebuild, redesign UI, or remove working functionality.
- Do not modify DB schema unless absolutely required.
- Preserve all current Supabase tables, RLS, auth, Stripe integration, parent portal, admin dashboard, registration, attendance, class management, and existing payment methods.
- Patch only what is broken. If a feature already works, leave it alone.
- Every fix must be verified not to regress adjacent features.

## Primary goal

Every time money is owed, the system reliably creates **one** invoice that appears in the Admin Dashboard, includes a Stripe payment link, and follows the correct approval workflow.

## Sections

1. **Registration invoice creation** — parent get-or-create, student dedupe, enroll/waitlist, tuition invoices only for enrolled, reg + recital fees, line items, immediate Admin visibility, no auto-email, idempotent against refresh/retry/double-submit.
2. **Parent invoice requests** — create Draft / Not Sent invoice for requested period + enrolled classes, idempotent, immediate Admin visibility.
3. **Stripe payment links** — exact amount match, invoice ID in metadata, saved URL, Admin can regenerate for unpaid only, Pay Online in portal/email only after Send. Stripe failure never blocks invoice/registration creation; Admin sees "Payment Link Missing" and can regenerate. Never expose secrets.
4. **Admin invoice workflow** — review, edit drafts only, send/resend, regenerate link, mark offline paid, cancel. Statuses: Draft, Sent, Unpaid, Paid, Cancelled, Expired, Waitlisted/No Tuition Invoice. Paid invoices are immutable.
5. **Parent portal** — only sent invoices visible, no drafts, no duplicate requests, Pay Online only when link exists, Paid shown after verified payment.
6. **Stripe webhook** — verify signature, validate amount + invoice ID, mark paid, update portal + admin, dedupe events. Never mark paid without verification.
7. **Preserve existing functionality** — registration, logins, attendance, schedule, availability, waitlists, tuition, discounts, fees, auth, RLS, Stripe, email, messaging, portal, admin.
8. **Error handling** — no stuck loading states; try/catch/finally everywhere; meaningful errors; retries where appropriate; Stripe/email/link failures never block core success.
9. **Final verification** — checklist of behaviors to confirm before shipping any change (single invoice per registration, no dupes, correct totals, waitlist-only creates none, portal gating, webhook marks Paid, existing features unaffected).
10. **Invoice recovery, refunds, failed transactions** —
    - Failed registration: no partial invoices/line items; safe retry; idempotent.
    - Failed invoice request: no duplicate drafts; idempotent.
    - Refunds: status Refunded, never reverts to Unpaid, preserve payment history + amount + date + reason, sync from Stripe webhook, shown in Admin + Portal, no auto new link, not counted as unpaid balance.
    - Status integrity: only valid transitions (e.g. Draft→Sent, Sent→Paid, Paid→Refunded, Draft/Sent→Cancelled). Block Refunded→Unpaid, Paid→Draft, Cancelled→Paid, Refunded→Sent.
    - Historical accuracy: original amount, payment/refund history, Stripe txn IDs, invoice number, audit timestamps preserved.
11. **Missing Invoices review (backfill)** — safe, idempotent audit exposed as a **"Missing Invoices"** section in Admin Dashboard rather than auto-backfill. Office reviews each candidate draft and clicks Send Invoice for the ones that should actually be billed. Skips waitlisted-only, cancelled, and registrations that already have an invoice (or a Paid invoice unless Admin explicitly regenerates). No auto-email, no portal exposure until Sent.

## Final backfill verification

- Every enrolled registration has exactly one invoice (unless billing schedule requires more).
- No duplicates.
- Paid invoices unchanged; Refunded stay Refunded; Cancelled stay Cancelled.
- Every new invoice has a Stripe link (or is clearly flagged as missing one).
- Every backfilled invoice appears in Admin Dashboard.
- No auto-email during backfill.
- Existing functionality unaffected.

## How to use this spec

On each future turn: pick one numbered section, confirm the specific symptom, patch narrowly, verify against the checklist in §9 and §10, stop.