-- Study With Rameen · Resource CMS (Upload Notes / Video Lectures admin redesign)
-- Adds an optional description to notes and lectures (shown on the new admin
-- card grid) and lets the teacher edit an already-uploaded note in place —
-- previously only insert/delete existed for notes, no update.
-- lectures already had a "for all" teacher policy, so it needs no new grant.

alter table public.notes
  add column if not exists description text;

alter table public.lectures
  add column if not exists description text;

drop policy if exists "Teacher can update notes" on public.notes;
create policy "Teacher can update notes"
  on public.notes for update
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid)
  with check (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

grant update on table public.notes to authenticated;
