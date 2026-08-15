-- Study With Rameen · make chapters cohort-scoped (2026-08-16)
--
-- Until now `chapters` had no cohort_id — both cohorts read one shared tree,
-- while notes/lectures inside it each carried their own cohort_id. That's why
-- the old chapter manager could report "2 lectures" under a topic while an
-- October/November student saw only 1: the second lecture belonged to
-- May/June. Rameen chose fully separate trees per cohort.
--
-- This clones the existing tree once per cohort, repoints every note and
-- lecture at its OWN cohort's copy, then deletes the originals. Nothing is
-- lost and nothing changes for students: each piece of content ends up under
-- a chapter of the same name, in its own cohort.
--
-- Every cohort that has content gets a clone, plus the two known cohorts, so
-- May/June starts with a ready-made copy of the syllabus structure (empty of
-- content) rather than a blank page. Prune it from Manage Content if unwanted.
--
-- Safe to run once. Re-running is a no-op: after the first run no chapter has
-- a null cohort_id, so the clone set is empty.

alter table public.chapters
  add column if not exists cohort_id text;

-- ---------------------------------------------------------------- clone map
-- One fresh uuid per (existing chapter × cohort). A plain table rather than a
-- temp one so this works the same however the SQL editor manages sessions.

drop table if exists public._chapter_clone_map;

create table public._chapter_clone_map as
select
  ch.id            as old_id,
  co.cohort_id     as cohort_id,
  gen_random_uuid() as new_id
from public.chapters ch
cross join (
  select distinct cohort_id from (
    select cohort_id from public.notes
    union select cohort_id from public.lectures
    union select 'on26'
    union select 'mj27'
  ) all_cohorts
  where cohort_id is not null
) co
where ch.cohort_id is null;

-- ------------------------------------------------------------ clone the tree
-- Two passes so a child is never inserted before the parent its parent_id
-- references. The UI only ever creates two levels (topic → sub-topic), which
-- is exactly what these two passes cover.

insert into public.chapters (id, subject, cohort_id, parent_id, title, sort_order, created_at)
select m.new_id, ch.subject, m.cohort_id, null, ch.title, ch.sort_order, ch.created_at
from public.chapters ch
join public._chapter_clone_map m on m.old_id = ch.id
where ch.cohort_id is null
  and ch.parent_id is null;

insert into public.chapters (id, subject, cohort_id, parent_id, title, sort_order, created_at)
select m.new_id, ch.subject, m.cohort_id, pm.new_id, ch.title, ch.sort_order, ch.created_at
from public.chapters ch
join public._chapter_clone_map m  on m.old_id  = ch.id
join public._chapter_clone_map pm on pm.old_id = ch.parent_id
                                 and pm.cohort_id = m.cohort_id
where ch.cohort_id is null
  and ch.parent_id is not null;

-- -------------------------------------------------- repoint the real content
-- Each note/lecture moves to the clone belonging to its own cohort.

update public.notes n
set chapter_id = m.new_id
from public._chapter_clone_map m
where m.old_id = n.chapter_id
  and m.cohort_id = n.cohort_id;

update public.lectures l
set chapter_id = m.new_id
from public._chapter_clone_map m
where m.old_id = l.chapter_id
  and m.cohort_id = l.cohort_id;

-- ----------------------------------------------------- drop the shared tree
-- notes.chapter_id / lectures.chapter_id do NOT cascade, so if anything still
-- pointed at an old shared chapter this fails loudly instead of orphaning it.
-- Sub-chapters cascade away with their parents (chapters.parent_id does).

delete from public.chapters where cohort_id is null;

drop table if exists public._chapter_clone_map;

alter table public.chapters
  alter column cohort_id set not null;

create index if not exists chapters_cohort_subject_idx
  on public.chapters (cohort_id, subject);

-- ------------------------------------------------------------------- RLS
-- Chapters are cohort-scoped now, so a student should only see their own
-- cohort's tree — matching how notes/lectures/assignments already behave.
-- The teacher's existing "Teacher can manage chapters" policy (for all)
-- still gives her every cohort, which Manage Content needs.

drop policy if exists "Anyone signed in can view chapters" on public.chapters;
drop policy if exists "Students can view their cohort's chapters" on public.chapters;
create policy "Students can view their cohort's chapters"
  on public.chapters for select
  using (
    exists (
      select 1 from public.students
      where students.id = auth.uid()
      and students.cohort_id = chapters.cohort_id
    )
  );
