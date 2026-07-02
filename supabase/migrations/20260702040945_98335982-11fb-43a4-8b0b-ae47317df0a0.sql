-- Payment tracking on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_environment TEXT,
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS paid_via TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_stripe_session
  ON public.invoices(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_pi
  ON public.invoices(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_sub
  ON public.invoices(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- One Stripe customer per parent
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_parents_stripe_customer
  ON public.parents(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
