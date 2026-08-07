/* Assignments & homework (student.html) — Phase 1 of the progress system.
   Lists the cohort's posted assignments; the student uploads photos/PDFs of
   their work, sees Submitted/Late status, and later their mark + feedback
   once Miss Rameen grades it. Exported rather than self-running because it
   needs STUDENT.cohortId — auth-guard.js calls renderStudentAssignments()
   once the profile has resolved. */

import { supabase } from "./supabase-config.js";
import { uploadToSubmissions } from "./storage-upload.js";

const TYPE_LABEL = { homework: "Homework", assignment: "Assignment", test: "Test" };

function fmtDue(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pastDue(dueDate) {
  return new Date() > new Date(dueDate + "T23:59:59");
}

export async function renderStudentAssignments() {
  const area = document.getElementById("assignmentsArea");
  if (!area) return;

  // RLS already hides assignments aimed at subjects this student isn't
  // enrolled in; the overlaps() filter keeps the intent visible client-side too.
  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("cohort_id", STUDENT.cohortId)
    .overlaps("subjects", STUDENT.subjects || [])
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
    supabase.from("submissions").select("*").in("assignment_id", ids),
    supabase.from("marks").select("*").in("assignment_id", ids),
  ]);
  const subBy = {};
  (subs || []).forEach((s) => { subBy[s.assignment_id] = s; });
  const markBy = {};
  (mks || []).forEach((m) => { markBy[m.assignment_id] = m; });

  area.innerHTML = assignments.map((a) => {
    const sub = subBy[a.id];
    const mark = markBy[a.id];
    const late = sub && new Date(sub.submitted_at) > new Date(a.due_date + "T23:59:59");

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
    } else {
      statusHTML = `
        <form class="asg-upload-form" data-asg-id="${a.id}">
          <input type="file" class="asg-file-input" multiple accept="image/*,application/pdf" required>
          <button type="submit" class="btn btn-primary btn-sm">Submit work</button>
        </form>
        ${pastDue(a.due_date) ? '<span class="asg-meta">Past the deadline — your submission will be flagged Late.</span>' : ""}`;
    }

    return `
    <article class="asg-card">
      <div class="asg-top">
        <span class="cat-tag">${TYPE_LABEL[a.type] || a.type}</span>
        <strong class="asg-title"></strong>
        <span class="asg-meta">Due ${fmtDue(a.due_date)} · out of ${a.max_marks}</span>
      </div>
      <div class="asg-status">${statusHTML}</div>
    </article>`;
  }).join("");

  area.querySelectorAll(".asg-title").forEach((el, i) => {
    el.textContent = assignments[i].title;
  });
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".asg-upload-form");
  // The Weekly Test upload form reuses .asg-upload-form but carries data-wt-id
  // and is handled in student-weekly-test.js — only claim real assignment forms.
  if (!form || !form.dataset.asgId) return;
  e.preventDefault();

  const input = form.querySelector(".asg-file-input");
  const files = Array.from(input.files);
  if (!files.length) return;

  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const assignmentId = form.dataset.asgId;
    const paths = await uploadToSubmissions(files, `${user.id}/${assignmentId}`);

    const { error: insertError } = await supabase.from("submissions").insert({
      assignment_id: assignmentId,
      student_id: user.id,
      file_paths: paths,
    });
    if (insertError) throw insertError;

    showToast("Work submitted", "Miss Rameen will mark it soon.");
    await renderStudentAssignments();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Submit work";
    showToast("Submission failed", err.message || "Please try again.");
  }
});
