
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS program text,
  ADD COLUMN IF NOT EXISTS selected_class_id uuid REFERENCES public.class_schedule(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tuition_item_id uuid REFERENCES public.tuition_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_choice text CHECK (payment_choice IN ('card','cash','invoice')),
  ADD COLUMN IF NOT EXISTS waiver_signature text,
  ADD COLUMN IF NOT EXISTS waivers_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_release boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_agreement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
