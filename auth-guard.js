/* Gates student.html behind a real Supabase session. Runs as a module, which
   is deferred until after student.js has defined applyIdentity() and
   registered its own DOMContentLoaded handler — see CLAUDE.md for the
   script-order reasoning.

   Boot sequence (reworked 2026-10-05 for speed):
   1. student.html's <head> script already sent anyone with no stored
      session to login.html before first paint, and — if this account's
      profile was cached on a previous load — pre-filled STUDENT (data.js)
      so the name/cohort are right from the first frame.
   2. body.auth-checking shows the shell with a skeleton in place of the
      views (style.css); no "Checking your session…" text any more.
   3. Here: getSession, then the single-device check and the profile fetch
      IN PARALLEL, then every data loader in parallel groups (only real
      dependencies are sequenced). The page is revealed when they finish,
      or after REVEAL_CAP_MS at the latest so one slow query can't hold the
      whole portal hostage; stragglers keep rendering into place.
   #authOverlay is now only for errors (retry prompt). */

import { supabase } from "./supabase-config.js";
import { renderAnnouncements } from "./student-announcements.js";
import { initNotifications } from "./student-notifications.js";
import { loadRealNotes } from "./student-notes.js";
import { loadRealLectures } from "./student-lectures.js";
import { loadWatchedLectures } from "./student-watched.js";
import { loadChapters } from "./chapters-data.js";
import { renderStudentAssignments } from "./student-assignments.js";
import { renderStudentWeeklyTest } from "./student-weekly-test.js";
import { renderStudentScoreboard } from "./student-scoreboard.js";
import { renderStudentGrades } from "./student-grades.js";
import { initStudentSettings } from "./student-settings.js";
import { verifySession, startSessionWatch, clearLocalToken, cacheProfile } from "./session-guard.js";

const REVEAL_CAP_MS = 4000;
const overlay = document.getElementById("authOverlay");

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
  overlay.hidden = false;
}

function reveal() {
  document.body.classList.remove("auth-checking");
  document.querySelector("main.content").removeAttribute("aria-busy");
}

async function safely(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[auth-guard] ${label} failed to load`, err);
  }
}

// Each loader is isolated (one throwing used to abort init() and leave the
// student stuck on the loading screen forever) and independent ones run
// concurrently. Notes/Vault need CHAPTERS, and watched-state needs LECTURES,
// so those three fetch together and render after; everything else is free.
function loadEverything() {
  return Promise.all([
    safely("announcements", renderAnnouncements),
    safely("notifications", initNotifications),
    safely("content", async () => {
      await Promise.all([
        safely("chapters", () => loadChapters(STUDENT.cohortId)),
        safely("notes", loadRealNotes),
        safely("lectures", loadRealLectures),
      ]);
      await safely("watched lectures", loadWatchedLectures);
      renderNotes();
      renderVault();
      // Syllabus Tracker rings read LECTURES + WATCHED_LECTURE_IDS.
      renderDashboard();
    }),
    safely("assignments", renderStudentAssignments),
    safely("weekly test", renderStudentWeeklyTest),
    safely("scoreboard", renderStudentScoreboard),
    safely("grades", renderStudentGrades),
    safely("settings", initStudentSettings),
  ]);
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

  if (!session) {
    location.replace("login.html");
    return;
  }

  // Teacher preview mode: if the teacher opens student.html?preview=<id>
  // while signed in as herself, load THAT student's profile into STUDENT so
  // every page renders as they see it. Session-guard is skipped (teacher
  // shouldn't get device-kicked), mutating student actions are gated by
  // STUDENT.isPreview across the student-*.js modules, and nothing is
  // cached. Teacher RLS already grants read access to every table read here.
  const previewId = new URLSearchParams(location.search).get("preview");
  const TEACHER_UID = "e6e72a6c-2242-42f4-8a09-116af571bb95";
  const isPreview = !!previewId && session.user.id === TEACHER_UID;
  const targetId = isPreview ? previewId : session.user.id;

  const [verified, profile] = await Promise.all([
    isPreview ? true : verifySession(session.user.id),
    withTimeout(supabase.from("students").select("*").eq("id", targetId).single(), 10000)
      .then(({ data }) => data)
      .catch(() => null),
  ]);
  if (!verified) return; // verifySession has already signed out + redirected

  if (profile) {
    STUDENT.id = profile.id;
    STUDENT.name = profile.name;
    STUDENT.initials = profile.initials;
    STUDENT.cohortName = profile.cohort_name;
    STUDENT.cohortId = profile.cohort_id;
    STUDENT.email = profile.email;
    if (Array.isArray(profile.subjects) && profile.subjects.length) STUDENT.subjects = profile.subjects;
    if (!isPreview) cacheProfile(STUDENT);
  } else if (!isPreview && window.__SWR_PROFILE__) {
    // Profile fetch failed but this account's cached profile is already
    // applied (data.js) — carry on with it rather than block the student.
    STUDENT.id = session.user.id;
  } else {
    showRetry("Couldn't load your profile — check your connection and try again.");
    return;
  }
  STUDENT.isPreview = isPreview;

  if (isPreview) {
    showPreviewBanner();
    document.body.classList.add("preview-mode");
  }
  applyIdentity();

  await Promise.race([loadEverything(), new Promise((r) => setTimeout(r, REVEAL_CAP_MS))]);
  reveal();
  if (!isPreview) startSessionWatch(session.user.id);
}

function showPreviewBanner() {
  const banner = document.createElement("div");
  banner.className = "preview-banner";
  banner.innerHTML = `
    <span>Previewing as <strong id="previewBannerName">this student</strong> — nothing you do here is saved.</span>
    <a href="teacher.html" class="btn btn-outline btn-sm">Back to teacher portal</a>`;
  document.body.prepend(banner);
  const el = document.getElementById("previewBannerName");
  if (el && STUDENT.name) el.textContent = STUDENT.name;
}

init();

document.querySelector(".snav-item.logout").addEventListener("click", async (e) => {
  e.preventDefault();
  clearLocalToken();
  await supabase.auth.signOut();
  location.href = "login.html";
});
