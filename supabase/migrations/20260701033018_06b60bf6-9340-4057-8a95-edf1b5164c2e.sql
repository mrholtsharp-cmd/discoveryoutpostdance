
DELETE FROM public.class_schedule;

INSERT INTO public.class_schedule (day, class_name, time, sort_order, age_group, instructor, description, monthly_tuition_cents) VALUES
('Tuesday', 'Naomi Solo', '5:30 PM – 6:00 PM', 1, NULL, 'Naomi', NULL, 3000),
('Tuesday', 'Boys Tap', '6:00 PM – 6:30 PM', 2, NULL, NULL, NULL, 3000),
('Tuesday', 'Women''s Jazz', '6:30 PM – 7:00 PM', 3, NULL, NULL, NULL, 3000),
('Tuesday', 'Women''s Tap', '7:00 PM – 7:30 PM', 4, NULL, NULL, NULL, 3000),
('Wednesday', 'Ross', '12:30 PM – 1:00 PM', 1, NULL, 'Ross', NULL, 3000),
('Wednesday', 'Littles Movement', '1:00 PM – 1:30 PM', 2, 'Ages 3–5', 'Olivia', 'Dance Room', 3500),
('Wednesday', 'Dance Class (Ages 5–6)', '1:00 PM – 2:00 PM', 3, 'Ages 5–6', NULL, NULL, 3500),
('Wednesday', 'Dance Class (Ages 7–10)', '1:30 PM – 2:30 PM', 4, 'Ages 7–10', NULL, NULL, 3500),
('Wednesday', 'Dance Class (Ages 10–14)', '2:00 PM – 3:00 PM', 5, 'Ages 10–14', NULL, NULL, 3500),
('Wednesday', 'Dance Class (Ages 14–18)', '3:00 PM – 4:00 PM', 6, 'Ages 14–18', NULL, NULL, 3500),
('Thursday', 'Jr Musical Theater', '2:00 PM – 2:30 PM', 1, 'Ages 8–12', NULL, NULL, 3000),
('Thursday', 'Teen Musical Theater', '2:30 PM – 3:00 PM', 2, NULL, NULL, NULL, 3000);
