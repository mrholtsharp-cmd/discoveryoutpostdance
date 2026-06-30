
-- Attendance table
CREATE TYPE public.attendance_status AS ENUM ('present','absent','late','excused');

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  class_date date NOT NULL,
  status public.attendance_status NOT NULL,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, class_date)
);
CREATE INDEX idx_attendance_date ON public.attendance(class_date);
CREATE INDEX idx_attendance_enrollment ON public.attendance(enrollment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Admins can fully manage attendance
CREATE POLICY "Admins manage attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Parents can read attendance for their own students
CREATE POLICY "Parents read own attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollments e
      JOIN public.students s ON s.id = e.student_id
      JOIN public.parents p ON p.id = s.parent_id
      WHERE e.id = attendance.enrollment_id
        AND p.auth_user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_attendance_updated_at
BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Admin notes columns
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS admin_notes text;

-- Allow admins to read/write all parents, students, enrollments, waitlist_entries, emergency_contacts
-- (existing policies cover parent-owned access; add admin policies)

CREATE POLICY "Admins manage parents" ON public.parents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage students" ON public.students
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage enrollments" ON public.enrollments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage waitlist" ON public.waitlist_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage emergency_contacts" ON public.emergency_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage invoice_requests" ON public.invoice_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins read subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
