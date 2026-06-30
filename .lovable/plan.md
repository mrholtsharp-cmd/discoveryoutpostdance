
# Registration system rebuild

Scope: registration, database, auth, enrollment. Payments code path is left alone — the new wizard ends at a Review step with a placeholder total (no Stripe call). Old `registrations` table is kept read-only for the admin dashboard / parent portal / payments that already depend on it; new flows write to the new tables.

## Database (new tables, all in `public`)

```text
parents              1 — n  students
parents              1 — n  emergency_contacts
classes              1 — n  enrollments     n — 1  students
classes              1 — n  waitlist_entries n — 1  students
```

- `parents` — `auth_user_id` (FK auth.users, unique), first_name, last_name, email (unique), phone, address.
- `emergency_contacts` — parent_id, name, phone, is_primary. Step 1 primary contact stored here.
- `students` — parent_id, first_name, last_name, date_of_birth, grade, allergies, medical_notes, shirt_size. Age is derived in the UI from DOB (not stored).
- `classes` — view/wrapper over `class_schedule` extended with `description`, `age_group`, `instructor`, `monthly_tuition_cents`. Missing columns added to `class_schedule` rather than duplicating data, so admin schedule editor keeps working.
- `enrollments` — student_id, class_id, status (`active`/`cancelled`), enrolled_at. Unique (student_id, class_id).
- `waitlist_entries` — student_id, class_id, position, created_at. Unique (student_id, class_id).

RLS: every table scoped by `parent.auth_user_id = auth.uid()` for parents; admins via existing `has_role(auth.uid(),'admin')`. GRANTs included in same migration.

Capacity: server function `enrollOrWaitlist(student_id, class_id)` runs in a transaction — counts active enrollments, compares to `class_schedule.capacity`; inserts into `enrollments` if room, else `waitlist_entries` with next position. Unique constraints prevent double-booking.

## Auth (account created during wizard)

Step 1 collects email + password alongside parent info. On Step 4 submit:
1. `supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin } })`.
2. Server fn `createParentProfile` (uses `requireSupabaseAuth`) writes parent row, emergency contact, students, then enrollments/waitlists atomically.
3. If email already exists → inline message asking to sign in first; pre-existing session reuses that auth user.

Google sign-in added to /auth (existing) — not required for the wizard but offered.

## Wizard UI (`/register` replaces current single-page form)

Mobile-first, single-column, sticky bottom action bar with Back / Continue. Progress indicator across 4 steps. Validation via zod + react-hook-form on each step; cannot advance until current step valid. Wizard state persisted in `sessionStorage` so refresh doesn't lose data.

- **Step 1 — Parent**: first/last name, email, password, phone, address, emergency contact name + phone.
- **Step 2 — Students**: array field, "Add another student" appends a card; each: first/last, DOB (shadcn date picker), auto-calculated age display, grade (select), allergies, medical notes, shirt size (select). Remove button per student (min 1).
- **Step 3 — Classes**: server fn `listClassesWithAvailability` returns all classes + `enrolled_count`, `capacity`, `remaining`, `is_full`. Rendered as cards showing name, description, age group, instructor, day, time, monthly tuition, "X spots left" or "Full — join waitlist" badge. Per student, multi-select which classes to enroll. Full classes show waitlist toggle instead.
- **Step 4 — Review**: students list, chosen classes per student, registration fee (constant from config), monthly tuition sum, **Total Due Today** = placeholder (Stripe disabled — shows "$X (payment coming soon)"). Submit calls `submitFullRegistration` server fn.

## Files

New:
- `supabase/migrations/<ts>_registration_rebuild.sql`
- `src/lib/registration-v2.functions.ts` (listClassesWithAvailability, submitFullRegistration, enrollOrWaitlist helper)
- `src/lib/registration-v2.schemas.ts` (shared zod schemas)
- `src/routes/register.tsx` — rewritten as wizard shell
- `src/components/register/Step1Parent.tsx`, `Step2Students.tsx`, `Step3Classes.tsx`, `Step4Review.tsx`, `WizardProgress.tsx`

Edited:
- `src/lib/schedule.functions.ts` — add description/age_group/instructor/monthly_tuition fields to schedule editor.
- Admin schedule UI (`admin.index.tsx` schedule section) — surface new fields.

Left untouched: all payments code, parent portal `/account`, admin registrations list, audit log, email templates, existing `registrations` table.

## Admin

Admin dashboard gets a new "Enrollments" + "Waitlist" tab fed by the new tables. The legacy "Registrations" tab keeps working against the old table until a follow-up migration ports historical data.

## Testing (before finishing)

Playwright scripts driving `http://localhost:8080/register`:
1. Happy path — 1 parent, 2 students, 1 class each, signup succeeds, rows appear in DB, redirected to /account.
2. Duplicate email at signup — inline error, no DB rows created.
3. Full class — auto-routes to waitlist, waitlist_entries row created with position 1.
4. Refresh mid-wizard — state restored from sessionStorage.
5. Mobile viewport (402×717) — every step usable, no horizontal scroll.

I'll fix any errors surfaced by these runs before declaring done.

## Out of scope (will not touch this turn)

- Stripe Checkout integration with new schema.
- Migrating historical `registrations` rows into new tables.
- Parent portal redesign against new schema.
