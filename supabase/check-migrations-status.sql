-- Study With Rameen · migration status check (READ-ONLY — changes nothing)
-- Paste into the Supabase SQL editor and run. Each row says whether the
-- thing that migration creates actually exists in this database.
-- applied = false → run that file from supabase/migrations/.

with fn as (
  select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select * from (values
  ( 1, 'core tables (announcements, assignments, attendance, notes, lectures, chapters, single-device-login, teacher-settings)',
       to_regclass('public.announcements') is not null and to_regclass('public.assignments') is not null
   and to_regclass('public.marks') is not null and to_regclass('public.attendance') is not null
   and to_regclass('public.notes') is not null and to_regclass('public.lectures') is not null
   and to_regclass('public.chapters') is not null and to_regclass('public.active_sessions') is not null
   and to_regclass('public.teacher_settings') is not null),
  ( 2, 'weekly-tests.sql',
       to_regclass('public.weekly_tests') is not null and to_regclass('public.weekly_test_submissions') is not null),
  ( 3, 'roster-management.sql',
       exists (select 1 from pg_policies where tablename = 'students' and policyname = 'Teacher can update student cohort')),
  ( 4, 'subject-enrolment.sql',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'subjects')
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assignments' and column_name = 'subjects')),
  ( 5, 'cohort-scoped-chapters.sql  (BLOCKING if false)',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chapters' and column_name = 'cohort_id' and is_nullable = 'NO')),
  ( 6, 'resource-cms.sql',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notes' and column_name = 'description')
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lectures' and column_name = 'description')
   and exists (select 1 from pg_policies where tablename = 'notes' and policyname = 'Teacher can update notes')),
  ( 7, 'weekly-test-grading.sql',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'weekly_tests' and column_name = 'assignment_id')),
  ( 8, 'watched-lectures.sql',
       to_regclass('public.watched_lectures') is not null),
  ( 9, 'watched-lectures-fix.sql',
       exists (select 1 from pg_policies where tablename = 'watched_lectures' and policyname = 'Students can update their own watched lectures')),
  (10, 'scoreboard-monthly-history.sql',
       exists (select 1 from fn where proname = 'get_scoreboard_months')),
  (11, 'scoreboard-monthly-fix.sql  (only one get_scoreboard may exist)',
       (select count(*) from fn where proname = 'get_scoreboard') = 1),
  (12, 'scoreboard-full-list.sql',
       exists (select 1 from fn where proname = 'get_scoreboard' and prosrc like '%fullList%')),
  (13, 'scoreboard-bar-redesign.sql',
       exists (select 1 from fn where proname = 'get_scoreboard' and prosrc like '%prevRank%')),
  (14, 'scoreboard-unranked.sql',
       exists (select 1 from fn where proname = 'get_scoreboard' and prosrc like '%''unranked''%')),
  (15, 'server-time.sql',
       exists (select 1 from fn where proname = 'get_server_time')),
  (16, 'announcement-reads.sql',
       to_regclass('public.announcement_reads') is not null
   and exists (select 1 from pg_policies where tablename = 'announcement_reads' and policyname = 'Students can update their own announcement reads')),
  (17, 'assignments-retain-graded.sql',
       exists (select 1 from pg_policies where tablename = 'assignments' and policyname = 'Students can view assignments they were graded on')),
  (18, 'attendance-subjects.sql',
       exists (select 1 from pg_constraint where conrelid = 'public.attendance'::regclass and conname = 'attendance_date_student_subject_key'))
) as t(step, migration, applied)
order by step;
