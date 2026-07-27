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
