
ALTER TABLE public.class_schedule
  ADD COLUMN IF NOT EXISTS stripe_monthly_lookup_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_semester_lookup_key TEXT;

UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_mt_8_12_monthly',     stripe_semester_lookup_key='do_mt_8_12_semester',     monthly_tuition_cents=3000 WHERE id='e021ae26-41fa-4f1b-b01a-73732923cabe';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_dance_3_5_monthly',   stripe_semester_lookup_key='do_dance_3_5_semester',   monthly_tuition_cents=3500 WHERE id='41f3bd61-81de-4f99-ad9c-ccb117a7cf00';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_womens_jazz_monthly', stripe_semester_lookup_key='do_womens_jazz_semester', monthly_tuition_cents=3000 WHERE id='bff665ce-0815-4095-9616-b34750f1daf1';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_boys_tap_9_18_monthly', stripe_semester_lookup_key='do_boys_tap_9_18_semester', monthly_tuition_cents=3000 WHERE id='f7ca9bbc-1224-4305-8555-6b2fe1631b31';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_dance_5_6_monthly',   stripe_semester_lookup_key='do_dance_5_6_semester',   monthly_tuition_cents=3500 WHERE id='7e1af926-a8a7-4f77-98e6-ae2b934f265d';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_womens_tap_monthly',  stripe_semester_lookup_key='do_womens_tap_semester',  monthly_tuition_cents=3000 WHERE id='0cd7abf8-c08c-4c7c-91d6-114062cdb0cf';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_mt_12_18_monthly',    stripe_semester_lookup_key='do_mt_12_18_semester',    monthly_tuition_cents=3000 WHERE id='cf9f898a-b814-44ff-89c1-ab7d3087996a';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_dance_7_10_monthly',  stripe_semester_lookup_key='do_dance_7_10_semester',  monthly_tuition_cents=3500 WHERE id='964fd600-aed2-44da-9679-76e4d8f49c59';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_dance_10_14_monthly', stripe_semester_lookup_key='do_dance_10_14_semester', monthly_tuition_cents=3500 WHERE id='f9121e02-3dcd-49d2-9a55-d89972ed497c';
UPDATE public.class_schedule SET stripe_monthly_lookup_key='do_dance_14_18_monthly', stripe_semester_lookup_key='do_dance_14_18_semester', monthly_tuition_cents=3500 WHERE id='b4a63c29-67ab-4081-892a-c4d2c3e47768';
