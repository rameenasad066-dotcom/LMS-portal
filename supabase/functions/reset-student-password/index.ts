// Study With Rameen · reset-student-password Edge Function
//
// Sets a new password for an existing student account — this is the real
// fix for "I forgot a student's password": nobody can ever retrieve the
// original (passwords are one-way hashed, by design, everywhere), so the
// only safe recovery path is issuing a new one. Same identity-verification
// pattern as create-student.
//
// Deploy via the Supabase Dashboard → Edge Functions → Create function
// (name it "reset-student-password", paste this file as index.ts).
//
// Uses the same secrets already set up for create-student:
//   TEACHER_UID, PROJECT_URL, ANON_KEY, SERVICE_ROLE_KEY
// Add them again for this function (Supabase secrets are per-function).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Only the real deployed site (and local dev) may call this function from a
// browser. The JWT + TEACHER_UID check below is the actual security
// boundary — this is defense-in-depth, restricting which origins the
// browser will even let the request through to in the first place.
const ALLOWED_ORIGINS = [
  "https://studywithrameenlms.netlify.app",
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

  let body: { studentId?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { studentId, newPassword } = body;
  if (!studentId || !newPassword) return json({ error: "Missing required fields" }, 400);
  if (newPassword.length < 8) return json({ error: "Password should be at least 8 characters" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: updateError } = await adminClient.auth.admin.updateUserById(studentId, { password: newPassword });
  if (updateError) return json({ error: updateError.message }, 400);

  return json({ ok: true });
});
