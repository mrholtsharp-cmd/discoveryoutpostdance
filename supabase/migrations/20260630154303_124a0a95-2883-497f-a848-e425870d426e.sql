
ALTER TABLE public.class_schedule
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS age_group TEXT,
  ADD COLUMN IF NOT EXISTS instructor TEXT,
  ADD COLUMN IF NOT EXISTS monthly_tuition_cents INTEGER CHECK (monthly_tuition_cents IS NULL OR monthly_tuition_cents >= 0);

CREATE TABLE public.parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX parents_email_lower_idx ON public.parents (lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parents TO authenticated;
GRANT ALL ON public.parents TO service_role;
ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parents_self_select" ON public.parents FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "parents_self_insert" ON public.parents FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "parents_self_update" ON public.parents FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "parents_admin_delete" ON public.parents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX emergency_contacts_parent_idx ON public.emergency_contacts(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts TO authenticated;
GRANT ALL ON public.emergency_contacts TO service_role;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ec_owner_all" ON public.emergency_contacts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents p WHERE p.id = parent_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.parents p WHERE p.id = parent_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  grade TEXT,
  allergies TEXT,
  medical_notes TEXT,
  shirt_size TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX students_parent_idx ON public.students(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students_owner_all" ON public.students FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents p WHERE p.id = parent_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.parents p WHERE p.id = parent_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.class_schedule(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id)
);
CREATE INDEX enrollments_class_active_idx ON public.enrollments(class_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enrollments_owner_all" ON public.enrollments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id WHERE s.id = student_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id WHERE s.id = student_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE TABLE public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.class_schedule(id) ON DELETE CASCADE,
  wait_position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id)
);
CREATE INDEX waitlist_class_idx ON public.waitlist_entries(class_id, wait_position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_entries TO authenticated;
GRANT ALL ON public.waitlist_entries TO service_role;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist_owner_all" ON public.waitlist_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id WHERE s.id = student_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id WHERE s.id = student_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_parents_touch BEFORE UPDATE ON public.parents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ec_touch BEFORE UPDATE ON public.emergency_contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_students_touch BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_enrollments_touch BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_waitlist_touch BEFORE UPDATE ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.enroll_or_waitlist(_student_id UUID, _class_id UUID)
RETURNS TABLE(placement TEXT, wait_position INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cap INTEGER;
  _count INTEGER;
  _pos INTEGER;
  _parent_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id
    WHERE s.id = _student_id AND (p.auth_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  ) INTO _parent_ok;
  IF NOT _parent_ok THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT capacity INTO _cap FROM public.class_schedule WHERE id = _class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.enrollments WHERE student_id=_student_id AND class_id=_class_id AND status='active') THEN
    RETURN QUERY SELECT 'already_enrolled'::TEXT, 0; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.waitlist_entries WHERE student_id=_student_id AND class_id=_class_id) THEN
    SELECT w.wait_position INTO _pos FROM public.waitlist_entries w WHERE w.student_id=_student_id AND w.class_id=_class_id;
    RETURN QUERY SELECT 'already_waitlisted'::TEXT, _pos; RETURN;
  END IF;

  SELECT COUNT(*) INTO _count FROM public.enrollments WHERE class_id=_class_id AND status='active';

  IF _cap IS NULL OR _count < _cap THEN
    INSERT INTO public.enrollments(student_id, class_id) VALUES (_student_id, _class_id);
    RETURN QUERY SELECT 'enrolled'::TEXT, 0; RETURN;
  ELSE
    SELECT COALESCE(MAX(w.wait_position),0)+1 INTO _pos FROM public.waitlist_entries w WHERE w.class_id=_class_id;
    INSERT INTO public.waitlist_entries(student_id, class_id, wait_position) VALUES (_student_id, _class_id, _pos);
    RETURN QUERY SELECT 'waitlisted'::TEXT, _pos; RETURN;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.enroll_or_waitlist(UUID, UUID) TO authenticated, service_role;
