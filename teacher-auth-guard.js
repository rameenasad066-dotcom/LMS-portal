/* Gates teacher.html behind Miss Rameen's specific Supabase account — not
   just "any logged-in session," since student accounts share the same
   Supabase Auth user pool. Runs as a module (deferred until after teacher.js
   has run), same script-order reasoning as auth-guard.js on the student
   side. Body gets .auth-checking (hides content) and #authOverlay is shown
   until this resolves. The session check is raced against a timeout so a
   stalled connection shows a retry prompt instead of hanging forever. */

import { supabase, TEACHER_UID } from "./supabase-config.js";

document.body.classList.add("auth-checking");
const overlay = document.getElementById("authOverlay");
overlay.hidden = false;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function showRetry(message) {
  overlay.innerHTML = "";
  const msg = document.createElement("p");
  msg.textContent = message;
  const btn = document.createElement("button");
  btn.className = "btn btn-primary btn-sm";
  btn.textContent = "Retry";
  btn.addEventListener("click", () => location.reload());
  overlay.append(msg, btn);
}

async function init() {
  let session;
  try {
    const result = await withTimeout(supabase.auth.getSession(), 10000);
    session = result.data.session;
  } catch {
    showRetry("Couldn't reach the server — check your connection and try again.");
    return;
  }

  if (!session || session.user.id !== TEACHER_UID) {
    location.replace("teacher-login.html");
    return;
  }

  document.body.classList.remove("auth-checking");
  overlay.hidden = true;
}

init();

document.querySelector(".snav-item.logout").addEventListener("click", async (e) => {
  e.preventDefault();
  await supabase.auth.signOut();
  location.href = "teacher-login.html";
});
