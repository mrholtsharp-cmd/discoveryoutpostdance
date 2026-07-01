
-- Existing rows use auth.users ids in parent_id; drop them so we can re-point the FK to parents(id).
DELETE FROM public.invoice_requests;

ALTER TABLE public.invoice_requests DROP CONSTRAINT IF EXISTS invoice_requests_parent_id_fkey;
ALTER TABLE public.invoice_requests
  ADD CONSTRAINT invoice_requests_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.parents(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_requests
  ADD COLUMN IF NOT EXISTS request_group_id UUID,
  ADD COLUMN IF NOT EXISTS invoiced_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoice_requests_group ON public.invoice_requests(request_group_id);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_parent ON public.invoice_requests(parent_id);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_status ON public.invoice_requests(status);

DROP POLICY IF EXISTS "Admins manage invoice_requests" ON public.invoice_requests;
DROP POLICY IF EXISTS "admins see all invoice requests" ON public.invoice_requests;
DROP POLICY IF EXISTS "admins update invoice requests" ON public.invoice_requests;
DROP POLICY IF EXISTS "parents create their own invoice requests" ON public.invoice_requests;
DROP POLICY IF EXISTS "parents see their own invoice requests" ON public.invoice_requests;

CREATE POLICY "Parents view own invoice requests"
  ON public.invoice_requests FOR SELECT TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid()));

CREATE POLICY "Parents create own invoice requests"
  ON public.invoice_requests FOR INSERT TO authenticated
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid()));

CREATE POLICY "Admins full access invoice requests"
  ON public.invoice_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_requests TO authenticated;
GRANT ALL ON public.invoice_requests TO service_role;
