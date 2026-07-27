-- Study With Rameen · Student Settings — let a student update their own
-- display name for real. Email is deliberately left alone: it's also the
-- student's login identifier, and self-service email changes add real
-- complexity (Rameen decided this isn't worth it for a minor feature —
-- she'd rather handle that herself if it ever comes up, the same way she
-- handles forgotten passwords via Reset Password).
--
-- Column-level grant restricts this to ONLY the name column — even if a
-- client tried to sneak cohort_id/email into the same update, Postgres
-- rejects the whole statement for lacking privilege on those columns.

drop policy if exists "Students can update own name" on public.students;
create policy "Students can update own name"
  on public.students for update
  using (id = auth.uid())
  with check (id = auth.uid());

grant update (name) on public.students to authenticated;
