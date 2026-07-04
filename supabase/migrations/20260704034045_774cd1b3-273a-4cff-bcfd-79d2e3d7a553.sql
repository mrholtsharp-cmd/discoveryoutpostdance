
-- Atomic enroll-or-waitlist for service-role callers (registration flow).
-- Locks class_schedule row, re-counts active enrollments under the lock,
-- then inserts either an enrollment or a waitlist entry.
CREATE OR REPLACE FUNCTION public.admin_enroll_or_waitlist(_student_id uuid, _class_id uuid)
RETURNS TABLE(placement text, wait_position integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cap INTEGER;
  _count INTEGER;
  _pos INTEGER;
BEGIN
  -- Row-lock the class to serialize concurrent enrollments.
  SELECT capacity INTO _cap FROM public.class_schedule WHERE id = _class_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;

  -- Idempotency: already active enrollment.
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
END; $function$;

-- Restrict: only backend service role can invoke this.
REVOKE ALL ON FUNCTION public.admin_enroll_or_waitlist(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enroll_or_waitlist(uuid, uuid) TO service_role;
