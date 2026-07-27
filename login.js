import { supabase } from "./supabase-config.js";
import { registerSession } from "./session-guard.js";

const $ = (id) => document.getElementById(id);

function friendlyError(err) {
  const msg = (err && err.message) || "";
  if (/invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (/unable to validate email/i.test(msg) || /invalid email/i.test(msg)) return "That email address looks invalid.";
  if (/rate limit/i.test(msg)) return "Too many attempts — please wait a moment and try again.";
  return msg || "Something went wrong — please try again.";
}

function showError(id, message) {
  const el = $(id);
  el.textContent = message;
  el.hidden = false;
  el.classList.remove("auth-success");
}

/* Already signed in? Skip straight to the portal. */
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) location.replace("student.html");
});

/* session-guard.js redirects here after signing a device out because the
   account logged in elsewhere — surface that instead of a silent bounce. */
if (new URLSearchParams(location.search).get("reason") === "elsewhere") {
  showError("siError", "You've been signed out because your account was signed in on another device.");
}

/* ---------- Sign in ---------- */

const signInForm = $("signInForm");

signInForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("siError").hidden = true;
  const email = $("siEmail").value.trim();
  const password = $("siPassword").value;
  const btn = signInForm.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await registerSession(data.user.id);
    location.href = "student.html";
  } catch (err) {
    showError("siError", friendlyError(err));
  } finally {
    btn.disabled = false;
  }
});

$("forgotPassword").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = $("siEmail").value.trim();
  if (!email) {
    showError("siError", "Enter your email above first, then click Forgot password.");
    return;
  }
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("update-password.html", location.href).href,
    });
    if (error) throw error;
    showError("siError", "Password reset email sent — check your inbox.");
    $("siError").classList.add("auth-success");
  } catch (err) {
    showError("siError", friendlyError(err));
  }
});
