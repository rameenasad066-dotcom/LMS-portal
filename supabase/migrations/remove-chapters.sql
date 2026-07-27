-- Study With Rameen · remove "The Pakistan Movement (1927–1947)" and
-- "Pakistan After Independence" chapters from History.
--
-- Safe by default: if either chapter still has real notes attached
-- (notes.chapter_id references chapters with no cascade), this will fail
-- with a foreign key error instead of silently orphaning those notes —
-- delete or reassign those notes first if that happens.

delete from public.chapters
where subject = 'history'
and parent_id is null
and title in ('The Pakistan Movement (1927–1947)', 'Pakistan After Independence');
