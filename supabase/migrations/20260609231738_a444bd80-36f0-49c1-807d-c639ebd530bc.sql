
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_student_name_len CHECK (char_length(student_name) BETWEEN 1 AND 100),
  ADD CONSTRAINT registrations_parent_name_len CHECK (char_length(parent_name) BETWEEN 1 AND 100),
  ADD CONSTRAINT registrations_email_len CHECK (char_length(email) BETWEEN 3 AND 255),
  ADD CONSTRAINT registrations_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  ADD CONSTRAINT registrations_phone_len CHECK (char_length(phone) BETWEEN 5 AND 30),
  ADD CONSTRAINT registrations_emergency_contact_len CHECK (char_length(emergency_contact) BETWEEN 1 AND 200),
  ADD CONSTRAINT registrations_desired_class_len CHECK (char_length(desired_class) BETWEEN 1 AND 100),
  ADD CONSTRAINT registrations_experience_level_len CHECK (char_length(experience_level) BETWEEN 1 AND 50),
  ADD CONSTRAINT registrations_medical_notes_len CHECK (medical_notes IS NULL OR char_length(medical_notes) <= 2000),
  ADD CONSTRAINT registrations_age_range CHECK (age BETWEEN 1 AND 120);
