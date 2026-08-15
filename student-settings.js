/* Real Student Settings — display name updates the real `students.name`
   row (needs the "Students can update own name" column-level policy, see
   supabase/migrations/student-settings.sql); email is deliberately
   read-only since it doubles as the login ID (Rameen's call — self-service
   email changes aren't worth the complexity here). Download quality is a
   genuine per-device preference with no server need, so it reuses the
   existing approved swr_student localStorage blob (setDownloadQuality/
   getDownloadQuality in data.js) rather than adding new storage. Exported
   rather than self-running — auth-guard.js calls it once STUDENT is
   resolved, same as the other student-*.js modules. applyIdentity()
   (student.js) already populates #setName/#setEmail from STUDENT on load,
   so this only needs to wire the submit handler and the quality select. */

import { supabase } from "./supabase-config.js";

export function initStudentSettings() {
  const qualityEl = document.getElementById("setQuality");
  if (qualityEl) qualityEl.value = getDownloadQuality();

  document.getElementById("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (STUDENT.isPreview) {
      showToast("Preview mode", "You're viewing as a student — changes aren't saved.");
      return;
    }
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const newName = document.getElementById("setName").value.trim();
      const { error } = await supabase.from("students").update({ name: newName }).eq("id", STUDENT.id);
      if (error) throw error;

      STUDENT.name = newName;
      applyIdentity();
      setDownloadQuality(document.getElementById("setQuality").value);
      showToast("Settings saved", "Your name and download preference are updated.");
    } catch (err) {
      showToast("Couldn't save settings", err.message || "Please try again.");
    } finally {
      btn.disabled = false;
    }
  });
}
