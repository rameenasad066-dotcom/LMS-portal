/* Gates student.html behind a real Supabase session. Runs as a module, which
   is deferred until after student.js has defined applyIdentity() and
   registered its own DOMContentLoaded handler — see CLAUDE.md for the
   script-order reasoning. Body gets .auth-checking (hides content) and
   #authOverlay is shown until this resolves, so nobody ever sees the
   placeholder demo student flash before the real profile loads. Every
   Supabase call is raced against a timeout so a stalled connection shows a
   retry prompt instead of hanging on "Checking your session…" forever. */

import { supabase } from "./supabase-config.js";
import { renderAnnouncements } from "./student-announcements.js";
import { loadRealNotes } from "./student-notes.js";
import { loadRealLectures } from "./student-lectures.js";
import { loadWatchedLectures } from "./student-watched.js";
import { loadChapters } from "./chapters-data.js";
import { renderStudentAssignments } from "./student-assignments.js";
import { renderStudentWeeklyTest } from "./student-weekly-test.js";
import { renderStudentScoreboard } from "./student-scoreboard.js";
import { renderStudentGrades } from "./student-grades.js";
import { initStudentSettings } from "./student-settings.js";
import { verifySession, startSessionWatch, clearLocalToken } from "./session-guard.js";
import "./student-quiz-attempts.js";

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

  if (!session) {
    location.replace("login.html");
    return;
  }

  // Teacher preview mode: if the teacher opens student.html?preview=<id>
  // while signed in as herself, load THAT student's profile into STUDENT so
  // every page renders as they see it. Session-guard is skipped (teacher
  // shouldn't get device-kicked), mutating student actions are gated by
  // STUDENT.isPreview across the student-*.js modules. Teacher RLS already
  // grants read access to all the tables the student pages read.
  const previewId = new URLSearchParams(location.search).get("preview");
  const TEACHER_UID = "e6e72a6c-2242-42f4-8a09-116af571bb95";
  const isPreview = previewId && session.user.id === TEACHER_UID;

  if (!isPreview && !(await verifySession(session.user.id))) return;

  try {
    const targetId = isPreview ? previewId : session.user.id;
    const { data: profile } = await withTimeout(
      supabase.from("students").select("*").eq("id", targetId).single(),
      10000
    );
    if (profile) {
      STUDENT.id = profile.id;
      STUDENT.name = profile.name;
      STUDENT.initials = profile.initials;
      STUDENT.cohortName = profile.cohort_name;
      STUDENT.cohortId = profile.cohort_id;
      STUDENT.email = profile.email;
      if (Array.isArray(profile.subjects) && profile.subjects.length) STUDENT.subjects = profile.subjects;
    }
    STUDENT.isPreview = !!isPreview;
  } catch {
    /* Profile fetch failed or timed out — falls back to the demo STUDENT
       values already in data.js rather than blocking the page. */
  }

  if (isPreview) showPreviewBanner();

  applyIdentity();
  if (STUDENT.isPreview) document.body.classList.add("preview-mode");
  await renderAnnouncements();
  await loadChapters(STUDENT.cohortId);
  await loadRealNotes();
  renderNotes();
  await loadRealLectures();
  await loadWatchedLectures();
  renderVault();
  // Dashboard's Syllabus Tracker rings also read LECTURES + WATCHED_LECTURE_IDS
  // (subjectProgress() in data.js) — re-render so they reflect real data, not
  // the empty pre-auth state from student.js's initial renderAll().
  renderDashboard();
  await renderStudentAssignments();
  await renderStudentWeeklyTest();
  await renderStudentScoreboard();
  await renderStudentGrades();
  initStudentSettings();
  if (!STUDENT.isPreview) startSessionWatch(session.user.id);
  document.body.classList.remove("auth-checking");
  overlay.hidden = true;
}

function showPreviewBanner() {
  const banner = document.createElement("div");
  banner.className = "preview-banner";
  banner.innerHTML = `
    <span>Previewing as <strong id="previewBannerName">this student</strong> — nothing you do here is saved.</span>
    <a href="teacher.html" class="btn btn-outline btn-sm">Back to teacher portal</a>`;
  document.body.prepend(banner);
  // Fill the name once STUDENT is populated.
  queueMicrotask(() => {
    const el = document.getElementById("previewBannerName");
    if (el && STUDENT.name) el.textContent = STUDENT.name;
  });
}

init();

document.querySelector(".snav-item.logout").addEventListener("click", async (e) => {
  e.preventDefault();
  clearLocalToken();
  await supabase.auth.signOut();
  location.href = "login.html";
});
