-- Study With Rameen · server clock for the Weekly Test upload cutoff (2026-09-19)
--
-- student-weekly-test.js decided whether to show the upload form (vs "uploads
-- closed") by comparing the DEVICE's own clock to closes_at. A phone with a
-- wrong clock/timezone (common — auto-time off, wrong region) can make the
-- page decide it's closed when it isn't, hiding the form even though the
-- real cutoff (already enforced server-side via RLS in weekly-tests.sql)
-- hasn't passed. This just gives the client a way to read the server's own
-- clock so the UI decision matches the real boundary instead of trusting
-- whatever time the student's device happens to think it is.

create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$ select now(); $$;

grant execute on function public.get_server_time() to authenticated;
