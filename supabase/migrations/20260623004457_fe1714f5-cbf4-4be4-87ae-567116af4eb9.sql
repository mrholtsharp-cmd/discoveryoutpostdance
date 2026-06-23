
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS student_first_name TEXT,
  ADD COLUMN IF NOT EXISTS student_last_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_address TEXT;

-- Prevent duplicate enrollments: same student (by first + last + DOB) in the same class.
-- Only enforced when all duplicate-key fields are present.
CREATE UNIQUE INDEX IF NOT EXISTS registrations_unique_student_class
  ON public.registrations (
    lower(student_first_name),
    lower(student_last_name),
    date_of_birth,
    desired_class
  )
  WHERE student_first_name IS NOT NULL
    AND student_last_name IS NOT NULL
    AND date_of_birth IS NOT NULL;
