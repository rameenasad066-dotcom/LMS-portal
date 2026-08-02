// Study With Rameen · remove-student Edge Function
//
// Permanently deletes a student — used for accidental Add Student mistakes
// (wrong cohort, duplicate, etc.) so Miss Rameen never has to open the
// Supabase dashboard herself. Deletes the auth.users login; the `students`
// row (and everything referencing it — marks, submissions, attendance,
// quiz_attempts, weekly_test_submissions, active_sessions) cascades away
// automatically, same as the earlier one-off mj26 cohort cleanup. Same
// identity-verification pattern as create-student / reset-student-password.
//
// Deploy via the Supabase Dashboard → Edge Functions → Create function
// (name it "remove-student", paste this file as index.ts).
//
// Uses the same secrets already set up for create-student:
//   TEACHER_UID, PROJECT_URL, ANON_KEY, SERVICE_ROLE_KEY
// Add them again for this function (Supabase secrets are per-function).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://studywithrameen-lms.netlify.app",
  "http://localhost:5501",
  "http://localhost:5500",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const supabaseUrl = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const teacherUid = Deno.env.get("TEACHER_UID");

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller || caller.id !== teacherUid) {
    return json({ error: "Not authorized" }, 403);
  }

  let body: { studentId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { studentId } = body;
  if (!studentId) return json({ error: "Missing studentId" }, 400);
  if (studentId === teacherUid) return json({ error: "Can't remove the teacher account" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(studentId);
  if (deleteError) return json({ error: deleteError.message }, 400);

  return json({ ok: true });
});
