
-- =====================================================
-- 1. class_schedule: semester tuition + Melissa instructor
-- =====================================================
ALTER TABLE public.class_schedule
  ADD COLUMN IF NOT EXISTS semester_tuition_cents INTEGER
    CHECK (semester_tuition_cents IS NULL OR semester_tuition_cents >= 0);

UPDATE public.class_schedule SET instructor = 'Melissa' WHERE instructor IS DISTINCT FROM 'Melissa';

-- Seed reasonable semester prices if not set (monthly * 4)
UPDATE public.class_schedule
   SET semester_tuition_cents = COALESCE(semester_tuition_cents,
       CASE
         WHEN monthly_tuition_cents IS NOT NULL THEN monthly_tuition_cents * 4
         ELSE NULL
       END);

-- =====================================================
-- 2. registrations: tuition plan + invoice preference
-- =====================================================
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS tuition_plan TEXT
    CHECK (tuition_plan IS NULL OR tuition_plan IN ('monthly','semester')),
  ADD COLUMN IF NOT EXISTS invoice_preference TEXT
    CHECK (invoice_preference IS NULL OR invoice_preference IN ('monthly','semester')),
  ADD COLUMN IF NOT EXISTS cash_payment BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- 3. Invoice number generator (per-year sequential)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);
GRANT ALL ON public.invoice_counters TO service_role;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "svc only counters" ON public.invoice_counters FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  n INTEGER;
BEGIN
  INSERT INTO public.invoice_counters(year, last_number) VALUES (y, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = public.invoice_counters.last_number + 1
    RETURNING last_number INTO n;
  RETURN 'DO-' || y::TEXT || '-' || LPAD(n::TEXT, 4, '0');
END;
$$;

-- =====================================================
-- 4. invoices + invoice_line_items
-- =====================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  parent_email TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  semester_year INTEGER NOT NULL,
  semester_label TEXT NOT NULL,
  tuition_plan TEXT NOT NULL CHECK (tuition_plan IN ('monthly','semester')),
  invoice_preference TEXT NOT NULL CHECK (invoice_preference IN ('monthly','semester')),
  cash_payment BOOLEAN NOT NULL DEFAULT false,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','sent','paid','overdue','cancelled')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_parent_idx ON public.invoices(parent_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(status);
CREATE INDEX IF NOT EXISTS invoices_semester_idx ON public.invoices(semester_year);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices: parents view own"
  ON public.invoices FOR SELECT TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid()));

CREATE POLICY "invoices: admin all"
  ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  student_name TEXT,
  class_id UUID REFERENCES public.class_schedule(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('tuition_monthly','tuition_semester','registration_fee','recital_fee','discount','other')),
  description TEXT NOT NULL,
  months INTEGER,
  unit_amount_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON public.invoice_line_items(invoice_id);

GRANT SELECT ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_items: parents view own"
  ON public.invoice_line_items FOR SELECT TO authenticated
  USING (invoice_id IN (
    SELECT id FROM public.invoices
    WHERE parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  ));

CREATE POLICY "line_items: admin all"
  ON public.invoice_line_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- 5. student_semester_fees
-- =====================================================
CREATE TABLE IF NOT EXISTS public.student_semester_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  semester_year INTEGER NOT NULL,
  registration_fee_charged BOOLEAN NOT NULL DEFAULT false,
  registration_fee_paid BOOLEAN NOT NULL DEFAULT false,
  recital_fee_charged BOOLEAN NOT NULL DEFAULT false,
  recital_fee_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, semester_year)
);
GRANT SELECT ON public.student_semester_fees TO authenticated;
GRANT ALL ON public.student_semester_fees TO service_role;
ALTER TABLE public.student_semester_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ssf: parents view own"
  ON public.student_semester_fees FOR SELECT TO authenticated
  USING (student_id IN (
    SELECT s.id FROM public.students s JOIN public.parents p ON p.id = s.parent_id
    WHERE p.auth_user_id = auth.uid()
  ));
CREATE POLICY "ssf: admin all"
  ON public.student_semester_fees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- 6. message_threads + messages
-- =====================================================
CREATE TABLE IF NOT EXISTS public.message_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threads_parent_idx ON public.message_threads(parent_id);
GRANT SELECT, INSERT, UPDATE ON public.message_threads TO authenticated;
GRANT ALL ON public.message_threads TO service_role;
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads: parents own"
  ON public.message_threads FOR SELECT TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid()));
CREATE POLICY "threads: parents create own"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid()));
CREATE POLICY "threads: admin all"
  ON public.message_threads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('parent','admin','system')),
  sender_user_id UUID,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON public.messages(thread_id);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages: parents view own"
  ON public.messages FOR SELECT TO authenticated
  USING (thread_id IN (
    SELECT id FROM public.message_threads
    WHERE parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
  ));
CREATE POLICY "messages: parents insert own"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'parent'
    AND thread_id IN (
      SELECT id FROM public.message_threads
      WHERE parent_id IN (SELECT id FROM public.parents WHERE auth_user_id = auth.uid())
    )
  );
CREATE POLICY "messages: admin all"
  ON public.messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- 7. contact_submissions (public form)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','replied','resolved')),
  admin_reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.contact_submissions TO service_role;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact: admin all"
  ON public.contact_submissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- Public inserts go through a service-role server route with validation; no anon INSERT policy.

-- =====================================================
-- 8. updated_at triggers
-- =====================================================
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ssf_updated BEFORE UPDATE ON public.student_semester_fees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_threads_updated BEFORE UPDATE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contact_updated BEFORE UPDATE ON public.contact_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
