-- Extend messaging: read tracking + delivery metadata
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'portal',
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_message_id text;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_delivery_method_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_delivery_method_check
  CHECK (delivery_method IN ('portal','email','both'));

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_email_status_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_email_status_check
  CHECK (email_status IS NULL OR email_status IN ('pending','sent','failed','skipped'));

-- Allow parents to mark their own admin messages as read (update read_at only)
DROP POLICY IF EXISTS "messages: parents mark read" ON public.messages;
CREATE POLICY "messages: parents mark read"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    sender_type = 'admin'
    AND thread_id IN (
      SELECT mt.id FROM public.message_threads mt
      WHERE mt.parent_id IN (SELECT p.id FROM public.parents p WHERE p.auth_user_id = auth.uid())
    )
  )
  WITH CHECK (
    sender_type = 'admin'
    AND thread_id IN (
      SELECT mt.id FROM public.message_threads mt
      WHERE mt.parent_id IN (SELECT p.id FROM public.parents p WHERE p.auth_user_id = auth.uid())
    )
  );