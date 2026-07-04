-- Payment link tracking columns on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_url text,
  ADD COLUMN IF NOT EXISTS stripe_session_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_amount_cents integer,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS receipt_url text;

CREATE INDEX IF NOT EXISTS idx_invoices_link_expires ON public.invoices(stripe_session_expires_at) WHERE stripe_session_expires_at IS NOT NULL;