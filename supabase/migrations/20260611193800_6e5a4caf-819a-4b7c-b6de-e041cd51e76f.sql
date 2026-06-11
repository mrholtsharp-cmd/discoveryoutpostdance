CREATE TABLE public.tuition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('class_monthly','class_semester','one_time')),
  name text NOT NULL,
  display_price text NOT NULL,
  description text NOT NULL DEFAULT '',
  stripe_price_id text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tuition_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tuition_items TO authenticated;
GRANT ALL ON public.tuition_items TO service_role;

ALTER TABLE public.tuition_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active tuition items"
  ON public.tuition_items FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert tuition items"
  ON public.tuition_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update tuition items"
  ON public.tuition_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete tuition items"
  ON public.tuition_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.tuition_items (kind, name, display_price, description, stripe_price_id, sort_order) VALUES
  ('class_monthly','Ballet','$80/mo','Monthly tuition for Ballet.','tuition_ballet_monthly',10),
  ('class_monthly','Jazz','$80/mo','Monthly tuition for Jazz.','tuition_jazz_monthly',20),
  ('class_monthly','Tap','$80/mo','Monthly tuition for Tap.','tuition_tap_monthly',30),
  ('class_monthly','Musical Theatre','$80/mo','Monthly tuition for Musical Theatre.','tuition_musical_theatre_monthly',40),
  ('class_semester','Ballet','$320 / semester','One-time payment for a 4-month semester of Ballet.','tuition_ballet_semester',10),
  ('class_semester','Jazz','$320 / semester','One-time payment for a 4-month semester of Jazz.','tuition_jazz_semester',20),
  ('class_semester','Tap','$320 / semester','One-time payment for a 4-month semester of Tap.','tuition_tap_semester',30),
  ('class_semester','Musical Theatre','$320 / semester','One-time payment for a 4-month semester of Musical Theatre.','tuition_musical_theatre_semester',40),
  ('one_time','Trial Class','$15','Try a class before enrolling.','trial_class_onetime',10),
  ('one_time','Recital Fee','$75','Annual recital fee, per family (up to 4 students).','recital_fee_onetime',20);