## Goal

Rebuild checkout into a real dance-studio billing engine: multi-student cart, $10 per-student-per-season registration fee, three payment options (auto-pay / monthly invoice / semester upfront), seasonal Aug–Nov-only charging, automatic proration when enrollment starts mid-season, and a parent dashboard to see/manage it all.

## Scope of THIS turn

A focused, working slice of items 1–5 from the sequencing list:

1. Data model for students + enrollments + season config
2. Cart UI that supports multiple students and the three payment options
3. $10 registration fee logic (charged once per student per season)
4. Seasonal billing engine (only Aug–Nov; proration math)
5. A first-pass parent dashboard ("My Account" page) showing enrolled students, classes, next charge date, payment method
6. Schedule swap to your new Tue/Wed/Thu list
7. Cash-only on /register, card-only on /tuition (re-confirmed)

Deferred to next turn (explicitly out of scope here so we don't ship half-broken):
- Admin pricing editor UI
- Google Sheets sync
- Invoice email automation + reminder emails
- Apple Pay / Google Pay wallet polish
- Go-live publish (we publish after you verify the flow)

## What I'll build

### 1. Database

New tables (with RLS):

- `students` — parent_id (auth.users), full_name, date_of_birth
- `enrollments` — student_id, class_id (from class_schedule), season_year, payment_plan ('auto_pay' | 'invoice' | 'semester'), status, stripe_subscription_id, created_at
- `registration_fees` — student_id, season_year, paid_at, stripe_charge_id (uniqueness: one per student+season)
- `season_config` — singleton-ish row: season_year, start_month=8, end_month=11, registration_fee_cents=1000

Extend `tuition_items` with `kind` ('class_monthly' | 'class_semester' | 'registration_fee') if not already there.

### 2. Server functions (`src/utils/payments.functions.ts`)

- `createEnrollmentCheckout({ items: [{studentId, classId, plan}], environment })` — single Stripe Checkout that:
  - Adds $10 fee per student that doesn't already have one for this season
  - For `auto_pay`: subscription mode; `cancel_at` = end of November of current season
  - For `semester`: one-time payment, amount = semester price × (remaining months / 4)
  - For `invoice`: creates DB rows + sends invoice email (no Stripe charge today)
  - Today's-total vs future-schedule returned to client for the cart summary
- `getMyEnrollments()` — list students + classes + next charge date (auth-protected)

### 3. Frontend

- `/tuition` — keep class list, but "Add to cart" now asks: which student? which payment plan?
- New cart drawer shows: per-student line items, $10 fee row (only if owed), discount text, today's total, future schedule
- `/register` — student creation form (cash flow only; says "to pay by card, go to /tuition")
- `/account` — list students, their classes, payment plan, next charge date, "manage payment method" button → Stripe billing portal
- Schedule component updated to Tue/Wed/Thu list

### 4. Proration math

```text
remaining_months = max(0, 12 - max(current_month, 8) + 1) clamped to [0,4]
semester_price_today = semester_full_price * (remaining_months / 4)
```

Examples surface in the cart: "Original $400 → Prorated $300 (start in Sept, 3 months left)".

## Risks / things to watch

- Stripe `cancel_at` only fires once — if you re-enroll a kid mid-November, code recomputes the cutoff
- `registration_fees` uniqueness prevents double-billing the $10
- Auto-pay requires login; cart blocks subscription checkout for anon users (already true)

## Acceptance checks before I hand it back

- Add two students, one class each, mixed payment plans → cart shows correct today's total + $20 in fees
- Auto-pay subscription created with `cancel_at` = Nov 30 of current season
- Account page shows both students with next charge date
- `/register` has no card option; `/tuition` has no cash option
- New schedule appears on home page

Ready to proceed?