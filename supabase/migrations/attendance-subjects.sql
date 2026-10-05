-- Study With Rameen · subject-specific attendance (2026-10-05)
--
-- Attendance was one row per (class_date, student) — a single class a day.
-- Pakistan Studies and Islamiyat are separate classes, and some students
-- take only one, so attendance is now tagged with the course the session
-- was for and is one row per (class_date, student, subject). A student who
-- takes both can be marked for two classes on the same day.
--
-- `subject` holds a COURSE id ('pakstudies' | 'islamiyat'), matching
-- COURSES in supabase-config.js: a class is taught per course, and Pak
-- Studies' two papers (history/geography) aren't separate sessions.
--
-- Legacy rows (marked before this) have no subject:
--   * students enrolled in exactly ONE course get that course backfilled —
--     the only class they could have attended;
--   * students enrolled in BOTH are ambiguous and stay NULL. NULL rows still
--     count toward the student's attendance % (they were genuinely marked),
--     and marking that day again for a subject re-tags them (the teacher
--     page replaces the untagged row).
--
-- Safe to re-run.

alter table public.attendance
  add column if not exists subject text;

alter table public.attendance drop constraint if exists attendance_subject_check;
alter table public.attendance add constraint attendance_subject_check
  check (subject is null or subject in ('pakstudies', 'islamiyat'));

-- Backfill single-course students' legacy rows.
update public.attendance a
set subject = case
  when s.subjects @> array['history', 'geography'] then 'pakstudies'
  else 'islamiyat'
end
from public.students s
where a.student_id = s.id
  and a.subject is null
  and (s.subjects @> array['history', 'geography']) <> (s.subjects @> array['islamiyat']);

-- Replace the old one-class-a-day uniqueness. Its name was auto-generated
-- (inline `unique (...)` in attendance.sql), so find it by its columns
-- rather than trusting the default name.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.attendance'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['class_date', 'student_id']
  loop
    execute format('alter table public.attendance drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.attendance drop constraint if exists attendance_date_student_subject_key;
alter table public.attendance add constraint attendance_date_student_subject_key
  unique (class_date, student_id, subject);
