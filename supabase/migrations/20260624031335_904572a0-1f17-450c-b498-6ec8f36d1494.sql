
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes text;

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_approval_status_check;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_approval_status_check
  CHECK (approval_status IN ('pending','approved','waitlisted','declined'));

CREATE INDEX IF NOT EXISTS idx_registrations_approval_status ON public.registrations(approval_status);

ALTER TABLE public.class_schedule
  ADD COLUMN IF NOT EXISTS capacity integer;

ALTER TABLE public.class_schedule
  DROP CONSTRAINT IF EXISTS class_schedule_capacity_check;
ALTER TABLE public.class_schedule
  ADD CONSTRAINT class_schedule_capacity_check
  CHECK (capacity IS NULL OR (capacity >= 0 AND capacity <= 1000));
