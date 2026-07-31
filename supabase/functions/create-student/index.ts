// Study With Rameen · create-student Edge Function
//
// Creates a student's Supabase Auth account + their `students` profile row
// in one call. Only Miss Rameen's own account may call this — the caller's
// JWT is verified server-side against the TEACHER_UID secret before the
// service-role client (which can bypass all RLS) is ever touched.
//
// Deploy via the Supabase Dashboard → Edge Functions → Create function
// (name it "create-student", paste this file as index.ts), or via the CLI:
//   supabase functions deploy create-student
//
// Required secrets (Project Settings → Edge Functions → Secrets):
//   TEACHER_UID       — Miss Rameen's own Supabase Auth user ID
//   PROJECT_URL       — Project Settings → API → Project URL
//   ANON_KEY          — Project Settings → API → anon public key
//   SERVICE_ROLE_KEY  — Project Settings → API → service_role secret key
// Supabase reserves the SUPABASE_ prefix for its own auto-injected secrets,
// so custom secrets need different names — this function checks both the
// custom names above and the SUPABASE_-prefixed auto-injected ones, in case
// those turn out to be available too.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Only the real deployed site (and local dev) may call this function from a
// browser. The JWT + TEACHER_UID check below is the actual security
// boundary — this is defense-in-depth, restricting which origins the
// browser will even let the request through to in the first place.
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

function initialsOf(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
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

  // Verify the caller is really Miss Rameen, using HER OWN session token —
  // this client only has anon-level access, it cannot fake a user.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller || caller.id !== teacherUid) {
    return json({ error: "Not authorized" }, 403);
  }

  let body: { name?: string; email?: string; password?: string; cohortId?: string; cohortName?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { name, email, password, cohortId, cohortName } = body;
  if (!name || !email || !password || !cohortId || !cohortName) {
    return json({ error: "Missing required fields" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password should be at least 8 characters" }, 400);
  }

  // From here on we use the service-role client — it bypasses RLS entirely,
  // which is exactly why the authorization check above must happen first.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) return json({ error: createError.message }, 400);

  const { error: insertError } = await adminClient.from("students").insert({
    id: created.user.id,
    name,
    email,
    initials: initialsOf(name),
    cohort_id: cohortId,
    cohort_name: cohortName,
  });
  if (insertError) {
    // Don't leave an orphaned auth user with no profile row.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: insertError.message }, 400);
  }

  return json({ ok: true, id: created.user.id });
});
