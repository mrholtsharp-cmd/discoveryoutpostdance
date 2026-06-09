Build a premium, mobile-first website for **Discovery Outpost Performing Arts Dance** (Tap, Jazz, Ballet) with a soft pink / black / white palette, full registration with database + email notifications, and an admin dashboard for editing the weekly schedule. Logo uploaded — I'll use it across nav, hero, and footer (kept in its original line-art black so it reads cleanly on the white/pink palette; happy to recolor on request).

## Brand & Design

- Studio name: **Discovery Outpost Performing Arts Dance**
- Logo: uploaded circular line-art dancer mark, used in nav (small) + footer; oversized as a watermark behind hero copy
- Palette tokens in `src/styles.css`: `--background #FFFFFF`, `--foreground #111111`, `--primary #E88AB0` (deep pink for buttons/links), `--accent #F7C6D9` (soft pink wash), matching foregrounds; light theme only
- Typography: Cormorant Garamond (display serif) for headings + Inter for body, loaded via `<link>` in `__root.tsx`, registered as `--font-display` / `--font-sans`
- Generous whitespace, subtle scroll fade-ins, gentle hover-lift on cards, soft pink gradient washes
- Image placeholders rendered as elegant pink-gradient slots sized for the photos you'll drop in later

## Routes

- `/` — Home (all sections below)
- `/register` — Full registration form
- `/schedule` — Full weekly schedule (reads from DB)
- `/auth` — Studio-owner sign in
- `/_authenticated/admin` — Admin dashboard: edit schedule, view registrations

## Home sections (in order)

Hero (logo watermark + headline + two CTAs + 4 stat chips) · About (studio image slot) · Classes (Ballet / Jazz / Tap cards with hover lift) · Schedule preview (Mon–Fri summary → link to full page) · Registration CTA banner · Gallery (6–8 placeholder tiles) · Testimonials (auto-advancing slider) · Why Choose Us (checklist) · Contact (form + phone/email/address + Google Maps iframe + Call / Register / Trial buttons + Instagram / Facebook / TikTok links) · Footer (logo, quick links, social, copyright).

## Backend (Lovable Cloud)

Tables (with GRANTs + RLS):
- `class_schedule` (day, class_name, time, sort_order) — public SELECT; admin write
- `registrations` (student_name, parent_name, email, phone, age, desired_class, experience_level, medical_notes, emergency_contact, is_trial) — public INSERT; admin SELECT
- `user_roles` + `app_role` enum + `has_role()` security-definer function

Seeded with the schedule from your brief.

Server functions:
- `submitRegistration` — Zod-validated insert + email both studio inbox and registrant
- `listSchedule` (public), `upsertScheduleEntry` / `deleteScheduleEntry` (admin)
- `listRegistrations` (admin)

## Auth + Admin

- Email/password sign in at `/auth` (no public signup — studio account only)
- First owner account promoted to `admin` via one-time SQL helper (I'll document the exact step in chat after build)
- Admin dashboard: schedule editor (add/edit/delete rows by day) + registrations table (searchable list with CSV export)

## Email

- Lovable Emails (built-in). After Cloud is enabled I'll prompt you through the one-time email-domain setup, then scaffold two templates:
  - `registration-confirmation` → parent/student
  - `registration-notification` → studio inbox
- Both triggered from `submitRegistration`

## SEO

- Per-route `head()` with unique title/description/og tags targeting "dance studio", "tap jazz ballet classes", and the studio name
- Semantic H1 per page, alt text on image slots, JSON-LD `DanceSchool` on home, canonical + og:url on leaves, viewport in `__root`

## Placeholders to swap later

Phone, email, street address, age range, social media URLs — all clearly marked `TODO` so they're easy to find.

## Out of scope (ask if you want them added)

- Real photos (slots are ready)
- Payments / deposits on registration
- Calendar-based trial booking (the Trial button currently sends users to the registration form pre-marked as a trial)
