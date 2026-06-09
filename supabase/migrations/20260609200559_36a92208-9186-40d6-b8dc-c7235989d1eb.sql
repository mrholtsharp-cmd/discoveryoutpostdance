
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Schedule
CREATE TABLE public.class_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day TEXT NOT NULL,
  class_name TEXT NOT NULL,
  time TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.class_schedule TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.class_schedule TO authenticated;
GRANT ALL ON public.class_schedule TO service_role;
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view schedule" ON public.class_schedule FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert schedule" ON public.class_schedule FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update schedule" ON public.class_schedule FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete schedule" ON public.class_schedule FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Registrations
CREATE TABLE public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INT NOT NULL,
  desired_class TEXT NOT NULL,
  experience_level TEXT NOT NULL,
  medical_notes TEXT,
  emergency_contact TEXT NOT NULL,
  is_trial BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT ALL ON public.registrations TO service_role;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can register" ON public.registrations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can view registrations" ON public.registrations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete registrations" ON public.registrations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed schedule
INSERT INTO public.class_schedule (day, class_name, time, sort_order) VALUES
('Monday', 'Ballet', '4:00 PM', 1),
('Monday', 'Jazz', '5:00 PM', 2),
('Tuesday', 'Tap', '4:00 PM', 1),
('Tuesday', 'Ballet', '5:00 PM', 2),
('Wednesday', 'Jazz', '4:00 PM', 1),
('Wednesday', 'Ballet', '5:30 PM', 2),
('Thursday', 'Tap', '4:30 PM', 1),
('Thursday', 'Jazz', '5:30 PM', 2),
('Friday', 'Open Technique / Practice', '5:00 PM', 1);
