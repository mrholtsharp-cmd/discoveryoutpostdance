
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['new','sent','paid','overdue','cancelled','refunded','partial_refund']::text[]));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS renewal_month text; -- e.g. "2026-08" for month 2+ auto-invoices
