-- Study With Rameen · Sunday Letter #1 (2026-11-02)
--
-- Posts the first Sunday Letter, written by Miss Rameen, to BOTH cohorts.
-- Run this AFTER sunday-letters.sql. To post it to only one cohort, delete
-- that cohort's line in the VALUES list below before running.
-- Safe to re-run: it won't post the same letter twice to a cohort.
-- (Later letters are posted from the Sunday Letter box on the teacher
-- dashboard; this file is just for the first one.)

insert into public.sunday_letters (cohort_id, title, preview, body)
select c.cohort_id, l.title, l.preview, l.body
from (values ('on26'), ('mj27')) as c(cohort_id)
cross join (select
  'Your effort is never wasted'::text as title,
  'Your effort is never wasted'::text as preview,
  $letter$Assalamu Alaikum, everyone,

Starting today, every Sunday you’ll find a letter from me here. Some weeks it’ll be a verse, some weeks a story, and some weeks just something I think you need to hear. Read it with your chai, before the week starts running away from you.

This week’s verse:

“And that there is not for man except that for which he strives, and that his effort is going to be seen.”
— Surah An-Najm, 53:39–40

Look at what Allah promises here. It isn’t the result. It isn’t the grade, the rank, or what your cousins will say when results come out. The promise is about the effort.

That matters because most of your effort is invisible. Nobody sees you redoing a question you got wrong for the third time, or opening the portal at 10pm when you’d rather be scrolling. Nobody sees the evening you sat down to revise even though you weren’t in the mood.

None of that is wasted. It is being seen and counted, even when it doesn’t show up on a test yet. That’s the beauty of this ayah. Allah didn’t promise to reward only the toppers or only the ones who got it right the first time. He promised that effort itself would be seen. So keep going, even on the days it feels small.

Your task this week: Pick the one topic you’ve been avoiding. Do just one quiz or one past-paper question on it. You don’t have to master it this week. Just start.

See you in class kids. luv yuh$letter$::text as body
) as l
where not exists (
  select 1 from public.sunday_letters s
  where s.cohort_id = c.cohort_id and s.title = l.title
);

-- Check it: select cohort_id, title, created_at from public.sunday_letters;
