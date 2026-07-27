-- Study With Rameen · chapters table (replaces static content.json chapters)
-- Real, teacher-managed, hierarchical (a chapter may optionally have
-- sub-chapters via parent_id). Any signed-in user (student or teacher) can
-- browse the syllabus structure; only the teacher can create/edit/delete it.

create table if not exists public.chapters (
  id uuid default gen_random_uuid() primary key,
  subject text not null,
  parent_id uuid references public.chapters(id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table public.chapters enable row level security;

drop policy if exists "Anyone signed in can view chapters" on public.chapters;
create policy "Anyone signed in can view chapters"
  on public.chapters for select
  using (auth.uid() is not null);

drop policy if exists "Teacher can manage chapters" on public.chapters;
create policy "Teacher can manage chapters"
  on public.chapters for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update, delete on table public.chapters to authenticated;
grant all on table public.chapters to service_role;

-- Seed the chapters that already existed in content.json, so nothing from
-- before this migration is lost. Guarded so re-running this whole script
-- (e.g. by accident) never creates duplicates.
insert into public.chapters (subject, title, sort_order)
select * from (values
  ('history',   'The Mughal Empire & Its Decline',   1),
  ('history',   'EIC BRITISH',                       2),
  ('history',   'Reformers',                         3),
  ('history',   'The Pakistan Movement (1927–1947)', 4),
  ('history',   'Pakistan After Independence',       5),
  ('geography', 'The Land & Climate of Pakistan',    1),
  ('geography', 'Agriculture & Water Resources',     2),
  ('geography', 'Industry, Trade & Transport',       3),
  ('islamiyat', 'The Holy Quran & Its Themes',       1),
  ('islamiyat', 'Life of the Holy Prophet ﷺ',        2),
  ('islamiyat', 'The Pillars of Islam',               3)
) as seed(subject, title, sort_order)
where not exists (
  select 1 from public.chapters existing
  where existing.subject = seed.subject and existing.title = seed.title and existing.parent_id is null
);

-- Seed the four Pillars of Islam sub-chapters already discussed. Same
-- duplicate guard.
insert into public.chapters (subject, parent_id, title, sort_order)
select 'islamiyat', c.id, sub.title, sub.sort_order
from public.chapters c
cross join (values ('Prayer', 1), ('Fasting', 2), ('Zakat', 3), ('Hajj', 4)) as sub(title, sort_order)
where c.title = 'The Pillars of Islam' and c.subject = 'islamiyat' and c.parent_id is null
and not exists (
  select 1 from public.chapters existing_sub
  where existing_sub.parent_id = c.id and existing_sub.title = sub.title
);

-- notes.chapter (a plain text id from the old static content.json) is
-- replaced by notes.chapter_id, a real foreign key into the new table.
alter table public.notes drop column if exists chapter;
alter table public.notes add column if not exists chapter_id uuid references public.chapters(id);
