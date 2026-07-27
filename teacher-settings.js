/* Real Teacher Settings — display name + default cohort live in
   `teacher_settings` (one row, keyed to TEACHER_UID; see
   supabase/migrations/teacher-settings.sql), since the teacher account had
   no profile table before this. Email is real too, via Supabase Auth's own
   updateUser() — that triggers a confirmation email to the NEW address, so
   the change only takes effect once she clicks the link in it, same as any
   other Supabase email change. Default cohort is applied by programmatically
   clicking the matching cohort pill once settings load — that reuses every
   other module's existing pill-click wiring (roster, assignments,
   scoreboard, notes-upload) instead of re-implementing cohort-switch logic
   here. */

import { supabase, TEACHER_UID } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const [{ data: settings }, { data: { user } }] = await Promise.all([
    supabase.from("teacher_settings").select("*").eq("id", TEACHER_UID).single(),
    supabase.auth.getUser(),
  ]);

  if (settings) {
    $("setName").value = settings.display_name;
    $("setCohort").value = settings.default_cohort;
    document.querySelector(".user-chip-name").textContent = settings.display_name;

    if (settings.default_cohort !== activeCohort) {
      const pill = document.querySelector(`.pill[data-cohort="${settings.default_cohort}"]`);
      if (pill) pill.click();
    }
  }
  if (user) $("setEmail").value = user.email;
}

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const newName = $("setName").value.trim();
    const newCohort = $("setCohort").value;
    const newEmail = $("setEmail").value.trim();

    const { error: upsertErr } = await supabase.from("teacher_settings").upsert({
      id: TEACHER_UID,
      display_name: newName,
      default_cohort: newCohort,
    });
    if (upsertErr) throw upsertErr;
    document.querySelector(".user-chip-name").textContent = newName;

    const { data: { user } } = await supabase.auth.getUser();
    if (user.email !== newEmail) {
      const { error: emailErr } = await supabase.auth.updateUser({ email: newEmail });
      if (emailErr) throw emailErr;
      showToast("Check your new email", `Click the confirmation link sent to ${newEmail} to finish changing it.`);
    } else {
      showToast("Settings saved", "Display name and default cohort updated.");
    }
  } catch (err) {
    showToast("Couldn't save settings", err.message || "Please try again.");
  } finally {
    btn.disabled = false;
  }
});

window.dataReadyPromise.then(loadSettings);
