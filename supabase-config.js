/* Study With Rameen · Supabase init — shared by login.js, teacher-login.js,
   auth-guard.js and teacher-auth-guard.js.
   The anon key below is a public client key, not a secret; the real
   security boundary is the Row Level Security policies on the `students`
   table (set up once in the Supabase SQL Editor — ask Claude for the SQL
   if you need to recreate it). */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://dtjdoblwxrikujmkzwgt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qV4qxDZbeThJXfUJU3cBLg_1VGFbPCA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* TODO: set this to Miss Rameen's own Supabase Auth user ID (Authentication
   → Users → copy the UID after creating her account). teacher-auth-guard.js
   uses this to keep student accounts out of the teacher portal; the
   create-student Edge Function has its own separate copy of this same value
   as a server-side secret, which is the actual security boundary — this
   client-side copy is only a UX gate, not the real defense. */
export const TEACHER_UID = "e6e72a6c-2242-42f4-8a09-116af571bb95";

/* Cohorts offered in the teacher portal's "Add Student" form. */
export const COHORTS = [
  { id: "on26", name: "October/November 2026" },
  { id: "mj27", name: "May/June 2027" },
];

/* The two courses Rameen actually sells, mapped to the portal's subject ids.
   Pakistan Studies is ONE course made of TWO papers/subjects, so the teacher
   UI always offers courses (never bare subjects) — that way a student can't
   accidentally end up enrolled in History but not Geography, which isn't a
   real thing she teaches. Everything downstream (content tables, RLS,
   filtering) works in expanded subject ids; the expansion happens once, at
   the moment a student is created or edited. */
export const COURSES = [
  { id: "pakstudies", name: "Pakistan Studies", subjects: ["history", "geography"] },
  { id: "islamiyat", name: "Islamiyat", subjects: ["islamiyat"] },
];

export const ALL_SUBJECT_IDS = COURSES.flatMap((c) => c.subjects);

export function subjectsForCourses(courseIds) {
  return COURSES.filter((c) => courseIds.includes(c.id)).flatMap((c) => c.subjects);
}

/* Which courses a stored subject list corresponds to — a course counts as
   enrolled when every one of its subjects is present, so a Pak Studies
   student reads back as Pak Studies rather than two loose papers. */
export function coursesForSubjects(subjects) {
  const list = subjects || [];
  return COURSES.filter((c) => c.subjects.every((s) => list.includes(s))).map((c) => c.id);
}

export function courseLabel(subjects) {
  const names = COURSES.filter((c) => c.subjects.every((s) => (subjects || []).includes(s))).map((c) => c.name);
  return names.length ? names.join(" + ") : "No subjects";
}
