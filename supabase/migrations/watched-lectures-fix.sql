-- Study With Rameen · fix watched_lectures upsert privilege (2026-09-04)
--
-- Students reported their watched-lecture progress filling in as they
-- watched, then resetting to 0% on refresh or re-login. Root cause:
-- markWatched() writes with `.upsert(..., { onConflict: "student_id,
-- lecture_id" })`, which Postgres executes as INSERT ... ON CONFLICT DO
-- UPDATE. That statement needs UPDATE privilege on the table to even be
-- planned, regardless of whether a given row actually hits the conflict
-- branch — watched-lectures.sql only ever granted select + insert, so
-- every single upsert was silently rejected. The optimistic UI update
-- made it look like it worked for the rest of that session; the very next
-- page load re-fetched from the server, found nothing there, and reset to
-- 0%. Same grant shape as `marks`, which already uses upsert successfully.

drop policy if exists "Students can update their own watched lectures" on public.watched_lectures;
create policy "Students can update their own watched lectures"
  on public.watched_lectures for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

grant update on table public.watched_lectures to authenticated;
