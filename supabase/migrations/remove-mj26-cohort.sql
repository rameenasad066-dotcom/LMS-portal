-- Study With Rameen · remove the May/June 2026 cohort entirely
-- Deletes the actual login (auth.users), which cascades to delete the
-- matching `students` row automatically (students.id references
-- auth.users on delete cascade). Also removes any notes/announcements
-- that were scoped to this cohort.
--
-- THIS IS PERMANENT. There is no undo once run.

delete from public.notes where cohort_id = 'mj26';
delete from public.announcements where cohort_id = 'mj26';
delete from auth.users where id in (select id from public.students where cohort_id = 'mj26');
