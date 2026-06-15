CREATE TABLE public.invoice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  student_name text,
  class_label text NOT NULL,
  monthly_amount_cents integer NOT NULL,
  season_year integer NOT NULL,
  months_remaining integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.invoice_requests TO authenticated;
GRANT ALL ON public.invoice_requests TO service_role;
ALTER TABLE public.invoice_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parents see their own invoice requests"
  ON public.invoice_requests FOR SELECT TO authenticated
  USING (parent_id = auth.uid());
CREATE POLICY "parents create their own invoice requests"
  ON public.invoice_requests FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid());
CREATE POLICY "admins see all invoice requests"
  ON public.invoice_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update invoice requests"
  ON public.invoice_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));