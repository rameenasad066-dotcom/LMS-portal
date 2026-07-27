/* Completes the "Forgot password?" flow started in login.js / teacher-login.js.
   Supabase's reset email links here with either a recovery token in the URL
   hash (implicit flow — detectSessionInUrl resolves this on its own) or a
   ?code=... query param (PKCE flow — needs an explicit exchange call). We
   handle both so this works regardless of which flow the Supabase project
   is configured for. */

import { supabase, TEACHER_UID } from "./supabase-config.js";
import { registerSession } from "./session-guard.js";

const $ = (id) => document.getElementById(id);

function friendlyError(err) {
  const msg = (err && err.message) || "";
  if (/password/i.test(msg) && /least/i.test(msg)) return "Password must be at least 8 characters.";
  if (/rate limit/i.test(msg)) return "Too many attempts — please wait a moment and try again.";
  return msg || "Something went wrong — please try again.";
}

function showError(message) {
  const el = $("upError");
  el.textContent = message;
  el.hidden = false;
}

async function resolveSession() {
  const code = new URLSearchParams(location.search).get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return null;
  }
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

resolveSession().then((session) => {
  if (!session) {
    $("upIntro").textContent = "This reset link is invalid or has expired. Go back and click \"Forgot password?\" again.";
    return;
  }
  $("upIntro").textContent = "Choose a new password for your account.";
  $("updateForm").hidden = false;
});

$("updateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("upError").hidden = true;
  const password = $("upPassword").value;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    const { data: { session } } = await supabase.auth.getSession();
    const isTeacher = session && session.user.id === TEACHER_UID;
    if (session && !isTeacher) await registerSession(session.user.id);
    location.href = isTeacher ? "teacher.html" : "student.html";
  } catch (err) {
    showError(friendlyError(err));
    btn.disabled = false;
  }
});
