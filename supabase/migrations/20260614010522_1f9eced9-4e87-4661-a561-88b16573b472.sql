
DELETE FROM public.tuition_items;

INSERT INTO public.tuition_items (kind, name, display_price, description, stripe_price_id, sort_order, active) VALUES
-- Monthly subscriptions ($35 dance / $30 musical theatre & tap)
('class_monthly','Dance (Ages 3–5)','$35/mo','Auto-billed each month for 4 months, then ends.','do_dance_3_5_monthly',10,true),
('class_monthly','Dance (Ages 5–6)','$35/mo','Auto-billed each month for 4 months, then ends.','do_dance_5_6_monthly',20,true),
('class_monthly','Dance (Ages 7–10)','$35/mo','Auto-billed each month for 4 months, then ends.','do_dance_7_10_monthly',30,true),
('class_monthly','Dance (Ages 10–14)','$35/mo','Auto-billed each month for 4 months, then ends.','do_dance_10_14_monthly',40,true),
('class_monthly','Dance (Ages 14–18)','$35/mo','Auto-billed each month for 4 months, then ends.','do_dance_14_18_monthly',50,true),
('class_monthly','Musical Theater Dance (Ages 8–12)','$30/mo','Auto-billed each month for 4 months, then ends.','do_mt_8_12_monthly',60,true),
('class_monthly','Musical Theater Dance (Ages 12–18)','$30/mo','Auto-billed each month for 4 months, then ends.','do_mt_12_18_monthly',70,true),
('class_monthly','Boys Tap (Ages 9–18)','$30/mo','Auto-billed each month for 4 months, then ends.','do_boys_tap_9_18_monthly',80,true),
('class_monthly','Women''s Jazz','$30/mo','Auto-billed each month for 4 months, then ends.','do_womens_jazz_monthly',90,true),
('class_monthly','Women''s Tap','$30/mo','Auto-billed each month for 4 months, then ends.','do_womens_tap_monthly',100,true),
-- Semester one-time ($140 dance / $120 musical theatre & tap)
('class_semester','Dance (Ages 3–5)','$140','One payment for the full 4-month semester.','do_dance_3_5_semester',10,true),
('class_semester','Dance (Ages 5–6)','$140','One payment for the full 4-month semester.','do_dance_5_6_semester',20,true),
('class_semester','Dance (Ages 7–10)','$140','One payment for the full 4-month semester.','do_dance_7_10_semester',30,true),
('class_semester','Dance (Ages 10–14)','$140','One payment for the full 4-month semester.','do_dance_10_14_semester',40,true),
('class_semester','Dance (Ages 14–18)','$140','One payment for the full 4-month semester.','do_dance_14_18_semester',50,true),
('class_semester','Musical Theater Dance (Ages 8–12)','$120','One payment for the full 4-month semester.','do_mt_8_12_semester',60,true),
('class_semester','Musical Theater Dance (Ages 12–18)','$120','One payment for the full 4-month semester.','do_mt_12_18_semester',70,true),
('class_semester','Boys Tap (Ages 9–18)','$120','One payment for the full 4-month semester.','do_boys_tap_9_18_semester',80,true),
('class_semester','Women''s Jazz','$120','One payment for the full 4-month semester.','do_womens_jazz_semester',90,true),
('class_semester','Women''s Tap','$120','One payment for the full 4-month semester.','do_womens_tap_semester',100,true),
-- One-time fees
('one_time','Season Registration Fee','$10','One-time per-student registration fee for the season.','do_registration_fee',10,true);
