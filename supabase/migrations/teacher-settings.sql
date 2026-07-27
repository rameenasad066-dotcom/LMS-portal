-- Study With Rameen · Teacher Settings (real backing for a page that was
-- previously "demo only" — display name + default cohort had nowhere to
-- live, since the teacher account is a single hardcoded UID with no
-- profile table until now. One row, keyed to that same UID.

create table if not exists public.teacher_settings (
  id uuid primary key default 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid,
  display_name text not null default 'Rameen Asad',
  default_cohort text not null default 'on26',
  updated_at timestamptz default now()
);

alter table public.teacher_settings enable row level security;

drop policy if exists "Teacher can manage own settings" on public.teacher_settings;
create policy "Teacher can manage own settings"
  on public.teacher_settings for all
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant select, insert, update on table public.teacher_settings to authenticated;
grant all on table public.teacher_settings to service_role;

insert into public.teacher_settings (id)
values ('e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
on conflict (id) do nothing;
