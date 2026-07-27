/* Single-device login enforcement for students (not the teacher account).
   Each successful sign-in writes a fresh random token to `active_sessions`
   and stores the same token in this device's localStorage. Whoever holds
   the token matching the database row is the "active" device — logging in
   elsewhere overwrites the database row, so the previously-active device's
   token goes stale and it gets signed out next time it checks. Checked on
   page load (auth-guard.js) and periodically while the app stays open, so
   an already-open tab gets kicked live rather than only on next visit. */

import { supabase } from "./supabase-config.js";

const TOKEN_KEY = "swr_session_token";
const CHECK_INTERVAL_MS = 30000;

export function clearLocalToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function registerSession(studentId) {
  const token = crypto.randomUUID();
  await supabase.from("active_sessions").upsert({
    student_id: studentId,
    session_token: token,
    updated_at: new Date().toISOString(),
  });
  localStorage.setItem(TOKEN_KEY, token);
}

async function kickOut() {
  clearLocalToken();
  await supabase.auth.signOut();
  location.replace("login.html?reason=elsewhere");
}

export async function verifySession(studentId) {
  const localToken = localStorage.getItem(TOKEN_KEY);
  if (!localToken) {
    await kickOut();
    return false;
  }
  const { data, error } = await supabase
    .from("active_sessions")
    .select("session_token")
    .eq("student_id", studentId)
    .single();
  if (error || !data || data.session_token !== localToken) {
    await kickOut();
    return false;
  }
  return true;
}

export function startSessionWatch(studentId) {
  setInterval(() => verifySession(studentId), CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) verifySession(studentId);
  });
}
