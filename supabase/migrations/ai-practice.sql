-- Study With Rameen · AI Practice (History 4-mark questions, marked by Gemini)
--
-- Students pick a past-paper question, write an answer, and the grade-answer
-- Edge Function marks it against that question's own mark scheme. This file
-- does three things:
--
--   1. Adds a `topic` to public.questions (the table had only section /
--      session / year — nothing to group repeat questions by). The 26 themes
--      below are a DRAFT written from the question wording: the same subject
--      recurs across years (Rowlatt Act, Swadeshi, Nehru Report, the 1956
--      Constitution, Simla Agreement…), so a theme gathers those repeats.
--      Edit any of them in the Table Editor; re-running this file never
--      overwrites a topic that is already set.
--
--   2. Locks down public.questions. mark_scheme is the answer key, and RLS
--      can't hide a single column, so column-level privileges do it: signed-in
--      users may read every column EXCEPT mark_scheme, notes and source_page.
--      Only the Edge Function (service role) reads the scheme, which is what
--      keeps this an attempt-first tool — students see a scheme's points only
--      in their feedback AFTER marking. Rows are limited to History students
--      (students.subjects contains 'history') and the teacher.
--
--   3. Creates public.student_attempts. There is deliberately NO insert or
--      update grant for browsers: the Edge Function writes each attempt after
--      Gemini has marked it, so a student can't post themselves 4/4.
--
-- Safe to re-run. Run it in the Supabase SQL editor, then deploy the
-- grade-answer Edge Function and add the GEMINI_API_KEY secret.

-- ---------------------------------------------------------------- 1. topics

alter table public.questions add column if not exists topic text;

update public.questions as q
set topic = v.topic
from (values
    (1, 'Mughal decline & the Marathas'), (2, 'Mughal decline & the Marathas'), (3, 'Mughal decline & the Marathas'), (4, 'Mughal decline & the Marathas'),
    (5, 'Rise of the British (East India Company)'), (6, 'Rise of the British (East India Company)'), (7, 'Rise of the British (East India Company)'), (8, 'Rise of the British (East India Company)'), (9, 'Rise of the British (East India Company)'), (10, 'Rise of the British (East India Company)'), (12, 'Rise of the British (East India Company)'),
    (11, 'British rule & reforms'), (13, 'British rule & reforms'), (16, 'British rule & reforms'), (17, 'British rule & reforms'),
    (14, 'Ranjit Singh & the Sikhs'), (15, 'Ranjit Singh & the Sikhs'),
    (18, 'War of Independence 1857'), (19, 'War of Independence 1857'), (20, 'War of Independence 1857'), (21, 'War of Independence 1857'), (22, 'War of Independence 1857'), (23, 'War of Independence 1857'), (24, 'War of Independence 1857'),
    (25, 'Sir Syed Ahmad Khan & Aligarh'), (26, 'Sir Syed Ahmad Khan & Aligarh'), (27, 'Sir Syed Ahmad Khan & Aligarh'), (28, 'Sir Syed Ahmad Khan & Aligarh'), (29, 'Sir Syed Ahmad Khan & Aligarh'), (30, 'Sir Syed Ahmad Khan & Aligarh'), (31, 'Sir Syed Ahmad Khan & Aligarh'),
    (32, 'Muslim reform & resistance movements'), (33, 'Muslim reform & resistance movements'), (34, 'Muslim reform & resistance movements'), (35, 'Muslim reform & resistance movements'), (36, 'Muslim reform & resistance movements'), (37, 'Muslim reform & resistance movements'), (38, 'Muslim reform & resistance movements'),
    (39, 'Languages of Pakistan'), (40, 'Languages of Pakistan'), (41, 'Languages of Pakistan'),
    (42, 'Bengal partition to the Muslim League (1905-09)'), (43, 'Bengal partition to the Muslim League (1905-09)'), (44, 'Bengal partition to the Muslim League (1905-09)'), (45, 'Bengal partition to the Muslim League (1905-09)'), (46, 'Bengal partition to the Muslim League (1905-09)'), (47, 'Bengal partition to the Muslim League (1905-09)'), (48, 'Bengal partition to the Muslim League (1905-09)'),
    (49, 'Lucknow Pact (1916)'), (50, 'Lucknow Pact (1916)'), (51, 'Lucknow Pact (1916)'),
    (52, 'Khilafat, Hijrat & Non-Cooperation'), (59, 'Khilafat, Hijrat & Non-Cooperation'), (60, 'Khilafat, Hijrat & Non-Cooperation'), (61, 'Khilafat, Hijrat & Non-Cooperation'), (62, 'Khilafat, Hijrat & Non-Cooperation'), (63, 'Khilafat, Hijrat & Non-Cooperation'),
    (53, 'Rowlatt Act & Amritsar (1919)'), (54, 'Rowlatt Act & Amritsar (1919)'), (55, 'Rowlatt Act & Amritsar (1919)'), (56, 'Rowlatt Act & Amritsar (1919)'), (57, 'Rowlatt Act & Amritsar (1919)'), (58, 'Rowlatt Act & Amritsar (1919)'),
    (64, 'Constitutional proposals of the 1920s-30s'), (65, 'Constitutional proposals of the 1920s-30s'), (66, 'Constitutional proposals of the 1920s-30s'), (67, 'Constitutional proposals of the 1920s-30s'), (68, 'Constitutional proposals of the 1920s-30s'), (71, 'Constitutional proposals of the 1920s-30s'), (72, 'Constitutional proposals of the 1920s-30s'),
    (69, 'Allama Iqbal & the idea of Pakistan'), (70, 'Allama Iqbal & the idea of Pakistan'), (73, 'Allama Iqbal & the idea of Pakistan'), (74, 'Allama Iqbal & the idea of Pakistan'), (75, 'Allama Iqbal & the idea of Pakistan'),
    (76, 'Government of India Act 1935 & Congress rule'), (77, 'Government of India Act 1935 & Congress rule'), (78, 'Government of India Act 1935 & Congress rule'), (79, 'Government of India Act 1935 & Congress rule'),
    (80, 'Road to independence (1942-47)'), (81, 'Road to independence (1942-47)'), (82, 'Road to independence (1942-47)'), (83, 'Road to independence (1942-47)'), (84, 'Road to independence (1942-47)'), (85, 'Road to independence (1942-47)'), (86, 'Road to independence (1942-47)'), (87, 'Road to independence (1942-47)'), (88, 'Road to independence (1942-47)'),
    (89, 'Early Pakistan (1947-58)'), (90, 'Early Pakistan (1947-58)'), (91, 'Early Pakistan (1947-58)'), (92, 'Early Pakistan (1947-58)'), (93, 'Early Pakistan (1947-58)'), (94, 'Early Pakistan (1947-58)'), (95, 'Early Pakistan (1947-58)'), (96, 'Early Pakistan (1947-58)'), (97, 'Early Pakistan (1947-58)'), (98, 'Early Pakistan (1947-58)'),
    (99, 'Ayub Khan era'), (100, 'Ayub Khan era'), (101, 'Ayub Khan era'), (102, 'Ayub Khan era'),
    (103, 'East Pakistan, 1971 & the Simla Agreement'), (104, 'East Pakistan, 1971 & the Simla Agreement'), (105, 'East Pakistan, 1971 & the Simla Agreement'), (106, 'East Pakistan, 1971 & the Simla Agreement'), (107, 'East Pakistan, 1971 & the Simla Agreement'), (108, 'East Pakistan, 1971 & the Simla Agreement'),
    (109, 'Zulfikar Ali Bhutto (1971-77)'), (110, 'Zulfikar Ali Bhutto (1971-77)'), (111, 'Zulfikar Ali Bhutto (1971-77)'), (112, 'Zulfikar Ali Bhutto (1971-77)'), (113, 'Zulfikar Ali Bhutto (1971-77)'),
    (114, 'Benazir Bhutto & Nawaz Sharif (1988-99)'), (115, 'Benazir Bhutto & Nawaz Sharif (1988-99)'), (116, 'Benazir Bhutto & Nawaz Sharif (1988-99)'), (117, 'Benazir Bhutto & Nawaz Sharif (1988-99)'), (118, 'Benazir Bhutto & Nawaz Sharif (1988-99)'), (119, 'Benazir Bhutto & Nawaz Sharif (1988-99)'), (120, 'Benazir Bhutto & Nawaz Sharif (1988-99)'), (121, 'Benazir Bhutto & Nawaz Sharif (1988-99)'),
    (122, 'General Pervez Musharraf'), (123, 'General Pervez Musharraf'),
    (124, 'Alliances & the Cold War'), (125, 'Alliances & the Cold War'), (126, 'Alliances & the Cold War'), (127, 'Alliances & the Cold War'), (133, 'Alliances & the Cold War'),
    (131, 'Relations with India'), (132, 'Relations with India'), (135, 'Relations with India'), (136, 'Relations with India'), (137, 'Relations with India'), (138, 'Relations with India'),
    (128, 'China, the Muslim world & Afghanistan'), (129, 'China, the Muslim world & Afghanistan'), (130, 'China, the Muslim world & Afghanistan'),
    (134, 'Zia-ul-Haq era (1977-88)'), (139, 'Zia-ul-Haq era (1977-88)'), (140, 'Zia-ul-Haq era (1977-88)'), (141, 'Zia-ul-Haq era (1977-88)'), (142, 'Zia-ul-Haq era (1977-88)'), (143, 'Zia-ul-Haq era (1977-88)')
) as v(id, topic)
where q.id = v.id
  and q.topic is null;

-- --------------------------------------------------------- 2. lock questions

alter table public.questions enable row level security;

drop policy if exists "History students and the teacher can read questions" on public.questions;
create policy "History students and the teacher can read questions"
  on public.questions for select
  to authenticated
  using (
    auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid
    or exists (
      select 1 from public.students s
      where s.id = auth.uid()
      and 'history' = any (s.subjects)
    )
  );

revoke all on table public.questions from anon, authenticated;
grant select (id, section, topic, session, year, paper_variant, question_ref, question, max_marks)
  on table public.questions to authenticated;
grant all on table public.questions to service_role;

-- ------------------------------------------------------- 3. student_attempts

create table if not exists public.student_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete restrict,
  student_answer text not null check (char_length(btrim(student_answer)) between 10 and 3000),
  marks_awarded integer not null check (marks_awarded >= 0),
  max_marks integer not null check (max_marks > 0),
  feedback text not null default '',
  -- points_credited / not_credited / missed_opportunities / borderline_notes,
  -- exactly as shown to the student.
  breakdown jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  check (marks_awarded <= max_marks)
);

create index if not exists student_attempts_student_idx
  on public.student_attempts (student_id, created_at desc);
create index if not exists student_attempts_question_idx
  on public.student_attempts (question_id);
create index if not exists student_attempts_created_idx
  on public.student_attempts (created_at desc);

alter table public.student_attempts enable row level security;

drop policy if exists "Students can view their own attempts" on public.student_attempts;
create policy "Students can view their own attempts"
  on public.student_attempts for select
  to authenticated
  using (student_id = auth.uid());

drop policy if exists "Teacher can view all attempts" on public.student_attempts;
create policy "Teacher can view all attempts"
  on public.student_attempts for select
  to authenticated
  using (auth.uid() = 'e6e72a6c-2242-42f4-8a09-116af571bb95'::uuid);

revoke all on table public.student_attempts from anon, authenticated;
grant select on table public.student_attempts to authenticated;
grant all on table public.student_attempts to service_role;

-- Live updates for the teacher's AI Practice page. Realtime applies the
-- select policies above, so a student's connection never receives anyone
-- else's attempts.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'student_attempts'
     ) then
    alter publication supabase_realtime add table public.student_attempts;
  end if;
end
$$;

notify pgrst, 'reload schema';
