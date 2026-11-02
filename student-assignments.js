/* Assignments & homework (student.html) — Phase 1 of the progress system.
   Lists the cohort's posted assignments; the student uploads photos/PDFs of
   their work, sees Submitted/Late status, and later their mark + feedback
   once Miss Rameen grades it. Weekly tests have their own page, so they are
   left out here. An assignment can carry a question and/or a PDF from Miss
   Rameen and a last upload date (uploads close after it; enforced in the
   database too, see supabase/migrations/assignment-question-pdf.sql).
   Exported rather than self-running because it needs STUDENT.cohortId —
   auth-guard.js calls renderStudentAssignments() once the profile has
   resolved. */

import { supabase } from "./supabase-config.js";
import { uploadToSubmissions, retryNetwork, isNetworkError, forgetStored } from "./storage-upload.js";

const TYPE_LABEL = { homework: "Homework", assignment: "Assignment", test: "Test" };

const ICON_PDF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';

function fmtDue(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pastDue(dueDate) {
  return new Date() > new Date(dueDate + "T23:59:59");
}

// A phone's own clock is often wrong, which would wrongly show or hide the upload form. Sync once against the
// server's clock (same as the Weekly Test page); the real boundary is still the database.
let clockOffsetMs = 0;

async function syncServerClock() {
  const { data, error } = await supabase.rpc("get_server_time");
  if (!error && data) clockOffsetMs = new Date(data).getTime() - Date.now();
}

function serverNow() {
  return Date.now() + clockOffsetMs;
}

// Uploads close when the last upload date is over: midnight at the end of that day, Pakistan time (UTC+5, no clock
// changes) — the same moment the database uses. No date means uploads never close.
function uploadsClosed(lastUploadDate) {
  return !!lastUploadDate && serverNow() >= Date.parse(lastUploadDate + "T00:00:00+05:00") + 86400000;
}

export async function renderStudentAssignments() {
  const area = document.getElementById("assignmentsArea");
  if (!area) return;

  await syncServerClock();

  // RLS already hides assignments aimed at subjects this student isn't
  // enrolled in; the overlaps() filter keeps the intent visible client-side too.
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("cohort_id", STUDENT.cohortId)
    .overlaps("subjects", STUDENT.subjects || [])
    // Weekly tests keep a hidden type='test' row for their marks; they are on the Weekly Test page, not here
    .neq("type", "test")
    .order("due_date", { ascending: false });

  if (error) {
    area.innerHTML = '<p class="empty-note">Couldn\'t load assignments right now — try refreshing.</p>';
    return;
  }
  if (!assignments.length) {
    area.innerHTML = '<p class="empty-note">Nothing assigned yet — new homework from Miss Rameen will appear here.</p>';
    return;
  }

  const ids = assignments.map((a) => a.id);
  const [{ data: subs }, { data: mks }] = await Promise.all([
    supabase.from("submissions").select("*").in("assignment_id", ids).eq("student_id", STUDENT.id),
    supabase.from("marks").select("*").in("assignment_id", ids).eq("student_id", STUDENT.id),
  ]);
  const subBy = {};
  (subs || []).forEach((s) => { subBy[s.assignment_id] = s; });
  const markBy = {};
  (mks || []).forEach((m) => { markBy[m.assignment_id] = m; });

  // The PDF Miss Rameen attached to an assignment: a short-lived link, like the Weekly Test paper
  const pdfUrls = {};
  await Promise.all(assignments.filter((a) => a.file_path).map(async (a) => {
    const { data } = await supabase.storage.from("assignment-files").createSignedUrl(a.file_path, 300);
    if (data) pdfUrls[a.id] = data.signedUrl;
  }));

  area.innerHTML = assignments.map((a) => {
    const sub = subBy[a.id];
    const mark = markBy[a.id];
    const late = sub && new Date(sub.submitted_at) > new Date(a.due_date + "T23:59:59");
    const closed = uploadsClosed(a.last_upload_date);

    let statusHTML;
    if (mark) {
      statusHTML = `
        <span class="status-pill ontime">Marked</span>
        <span class="asg-score">${mark.marks} / ${a.max_marks}</span>
        ${mark.feedback ? `<p class="asg-feedback">${esc(mark.feedback)}</p>` : ""}`;
    } else if (sub) {
      statusHTML = `
        <span class="status-pill ${late ? "late" : "ontime"}">${late ? "Submitted late" : "Submitted"}</span>
        <span class="asg-meta">Waiting to be marked</span>`;
    } else if (closed) {
      statusHTML = `
        <span class="status-pill late">Closed</span>
        <span class="asg-meta">Uploads closed on ${fmtDue(a.last_upload_date)}.</span>`;
    } else {
      const note = pastDue(a.due_date)
        ? `Past the deadline — your submission will be flagged Late.${a.last_upload_date ? ` You can still upload until ${fmtDue(a.last_upload_date)}.` : ""}`
        : a.last_upload_date ? `Uploads close after ${fmtDue(a.last_upload_date)}.` : "";
      statusHTML = `
        <form class="asg-upload-form" data-asg-id="${a.id}" data-asg-last="${a.last_upload_date || ""}">
          <input type="file" class="asg-file-input" multiple accept="image/*,application/pdf" required>
          <small class="asg-meta">Tip: choose files saved on your phone (Downloads or Gallery), not from Google Drive.</small>
          <button type="submit" class="btn btn-primary btn-sm">Submit work</button>
        </form>
        ${note ? `<span class="asg-meta">${note}</span>` : ""}`;
    }

    const brief = a.question || pdfUrls[a.id]
      ? `<div class="asg-brief">
        ${a.question ? '<p class="asg-question"></p>' : ""}
        ${pdfUrls[a.id]
          ? `<a class="wt-paper" href="${pdfUrls[a.id]}" target="_blank" rel="noopener">
          <span class="wt-paper-icon">${ICON_PDF}</span>
          <span class="wt-paper-info"><strong>Download assignment PDF</strong><small>PDF · opens in a new tab</small></span>
          <span class="wt-paper-cta">${ICON_DOWNLOAD}</span>
        </a>`
          : ""}
      </div>`
      : "";

    return `
    <article class="asg-card">
      <div class="asg-top">
        <span class="cat-tag">${TYPE_LABEL[a.type] || a.type}</span>
        <strong class="asg-title"></strong>
        <span class="asg-meta">Due ${fmtDue(a.due_date)}${a.last_upload_date ? ` · Last upload ${fmtDue(a.last_upload_date)}` : ""} · out of ${a.max_marks}</span>
      </div>
      ${brief}
      <div class="asg-status">${statusHTML}</div>
    </article>`;
  }).join("");

  area.querySelectorAll(".asg-card").forEach((card, i) => {
    card.querySelector(".asg-title").textContent = assignments[i].title;
    const q = card.querySelector(".asg-question");
    if (q) q.textContent = assignments[i].question;
  });
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".asg-upload-form");
  // The Weekly Test upload form reuses .asg-upload-form but carries data-wt-id
  // and is handled in student-weekly-test.js — only claim real assignment forms.
  if (!form || !form.dataset.asgId) return;
  e.preventDefault();

  if (STUDENT.isPreview) {
    showToast("Preview mode", "You're viewing as a student — submissions aren't saved.");
    return;
  }

  // The page may have been open since before the last upload date passed
  if (uploadsClosed(form.dataset.asgLast)) {
    showToast("Uploads closed", "The last upload date for this assignment has passed.");
    await renderStudentAssignments();
    return;
  }

  const input = form.querySelector(".asg-file-input");
  const files = Array.from(input.files);
  if (!files.length) return;

  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  try {
    const assignmentId = form.dataset.asgId;
    const prefix = `${STUDENT.id}/${assignmentId}`;
    const paths = await uploadToSubmissions(files, prefix, (done, total) => {
      btn.textContent = `Uploading ${done + 1} of ${total}…`;
    });

    btn.textContent = "Saving…";
    const { error: insertError } = await retryNetwork(() => supabase.from("submissions").insert({
      assignment_id: assignmentId,
      student_id: STUDENT.id,
      file_paths: paths,
    }));
    // 42501 = the database refused it: the last upload date passed while the files were uploading
    if (insertError && insertError.code === "42501") {
      throw new Error("Uploads for this assignment have just closed.");
    }
    if (insertError && insertError.code !== "23505") {
      throw isNetworkError(insertError)
        ? new Error("Your files are uploaded but the final save didn't go through. Check your internet and press the button again — nothing will be re-uploaded.")
        : insertError;
    }
    forgetStored(prefix, files);

    showToast("Work submitted", "Miss Rameen will mark it soon.");
    await renderStudentAssignments();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Submit work";
    showToast("Submission failed", err.message || "Please try again.");
  }
});
