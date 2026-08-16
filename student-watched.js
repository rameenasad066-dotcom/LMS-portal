/* Real, Supabase-backed "watched lecture" tracking — replaces the old
   localStorage-only version (swr_student blob, key w_<id>). That version
   was per-device with no server record at all: it never synced across a
   student's own devices, and it was ALWAYS 0% when Rameen checked from her
   own browser, since "View as a student" preview runs in her browser,
   which never had any student's local watch history. Runs as a module —
   see teacher-auth-guard.js for the script-order reasoning. */

import { supabase } from "./supabase-config.js";

// One-time carry-over for students who already had watched marks sitting in
// this browser's localStorage from before this table existed — only rescues
// what THIS device knows about, not a full history, but better than resetting
// everyone to 0% the day this ships. Safe to run every login: anything
// already migrated is skipped since it's already in the server set.
function localWatchedIds() {
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem("swr_student") || "{}");
  } catch {
    return [];
  }
  return Object.keys(raw)
    .filter((k) => k.startsWith("w_") && raw[k])
    .map((k) => k.slice(2));
}

export async function loadWatchedLectures() {
  if (!STUDENT.id) {
    WATCHED_LECTURE_IDS = new Set();
    return;
  }

  const { data, error } = await supabase
    .from("watched_lectures")
    .select("lecture_id")
    .eq("student_id", STUDENT.id);

  WATCHED_LECTURE_IDS = new Set(error ? [] : data.map((r) => r.lecture_id));

  // The migration reads THIS browser's localStorage, which only makes sense
  // when the person sitting at this browser is the student themselves — in
  // preview mode this device is Rameen's, so its localStorage has nothing to
  // do with the student being previewed and must not be touched.
  if (STUDENT.isPreview) return;

  // Only real lecture ids — a stale localStorage entry pointing at a
  // deleted lecture, or a leftover from the pre-Supabase demo array, would
  // violate the foreign key and fail the whole batch otherwise.
  const realIds = new Set(LECTURES.map((l) => l.id));
  const toMigrate = localWatchedIds().filter((id) => !WATCHED_LECTURE_IDS.has(id) && realIds.has(id));
  if (!toMigrate.length) return;

  const { error: migrateError } = await supabase
    .from("watched_lectures")
    .upsert(
      toMigrate.map((lecture_id) => ({ student_id: STUDENT.id, lecture_id })),
      { onConflict: "student_id,lecture_id" }
    );
  if (!migrateError) toMigrate.forEach((id) => WATCHED_LECTURE_IDS.add(id));
}

window.markWatched = async function markWatched(lectureId) {
  if (STUDENT.isPreview) {
    showToast("Preview mode", "You're viewing as a student — nothing's saved.");
    return;
  }
  if (WATCHED_LECTURE_IDS.has(lectureId)) return;

  // Optimistic — the ring/checkmark update immediately rather than waiting
  // on the round trip, matching the localStorage version's instant feel.
  WATCHED_LECTURE_IDS.add(lectureId);
  renderVault();
  renderDashboard();

  const { error } = await supabase
    .from("watched_lectures")
    .upsert({ student_id: STUDENT.id, lecture_id: lectureId }, { onConflict: "student_id,lecture_id" });

  if (error) {
    WATCHED_LECTURE_IDS.delete(lectureId);
    renderVault();
    renderDashboard();
    showToast("Couldn't save", "Please try again.");
  }
};
