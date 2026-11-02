/* Assignments & marking (teacher.html) — Phase 1 of the progress system.
   Post homework/assignments to the active cohort (weekly tests have their own
   section and are left out of this board), see who submitted,
   open their files, and enter marks (+ optional feedback). Marks can be
   entered without a portal submission too, since weekly tests arrive on
   WhatsApp. Runs as a module — see teacher-auth-guard.js for the
   script-order reasoning. */

import { supabase, COURSES, ALL_SUBJECT_IDS, subjectsForCourses, courseLabel, courseSelectHTML, subjectsForCourseChoice } from "./supabase-config.js";
import { safeFileName } from "./storage-upload.js";

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { homework: "Homework", assignment: "Assignment", test: "Test" };

/* An assignment carries the subjects of the one course it's for; a student
   sees it when their own subjects overlap. All three = posted before the
   courses were separated — it counts for both until re-tagged. */
function audienceLabel(subjects) {
  const list = subjects || [];
  return ALL_SUBJECT_IDS.every((s) => list.includes(s)) ? "Both courses (not yet tagged)" : courseLabel(list);
}

function isFor(student, assignment) {
  const theirs = student.subjects || [];
  const aimed = assignment.subjects || [];
  return theirs.some((s) => aimed.includes(s));
}

let openAssignmentId = null;

function fmtDue(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isLate(submittedAt, dueDate) {
  return new Date(submittedAt) > new Date(dueDate + "T23:59:59");
}

/* The question, the PDF and the last upload date need the fields and the private
   bucket from supabase/migrations/assignment-question-pdf.sql. They are only sent
   when used, so posting a plain assignment keeps working before that SQL is run. */
const PDF_BUCKET = "assignment-files";
const SQL_HINT = "The database needs the new assignment fields first. Run supabase/migrations/assignment-question-pdf.sql once in the Supabase SQL editor, then try again.";

function friendlyError(err, fallback) {
  const m = (err && err.message) || "";
  if (/Could not find the '(question|file_path|last_upload_date)' column|Bucket not found/i.test(m)) return SQL_HINT;
  return m || fallback;
}

let currentAsg = null; // the assignment open in the marking view

async function renderArea() {
  if (openAssignmentId) await renderMarkingView();
  else await renderListView();
}

async function renderListView() {
  const area = $("assignmentsArea");
  $("asgHint").textContent = `Posts to ${COHORT_DATA[activeCohort].name}`;

  const { data: assignments, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("cohort_id", activeCohort)
    // Weekly tests keep a hidden type='test' row for their marks; they have their own section
    .neq("type", "test")
    .order("due_date", { ascending: false });

  if (error) {
    area.innerHTML = `<p class="empty-note">Couldn't load assignments: ${esc(error.message)}</p>`;
    return;
  }

  const subCounts = {};
  const markCounts = {};
  if (assignments.length) {
    const ids = assignments.map((a) => a.id);
    const [{ data: subs }, { data: mks }] = await Promise.all([
      supabase.from("submissions").select("assignment_id").in("assignment_id", ids),
      supabase.from("marks").select("assignment_id").in("assignment_id", ids),
    ]);
    (subs || []).forEach((s) => { subCounts[s.assignment_id] = (subCounts[s.assignment_id] || 0) + 1; });
    (mks || []).forEach((m) => { markCounts[m.assignment_id] = (markCounts[m.assignment_id] || 0) + 1; });
  }

  area.innerHTML = `
    <form class="settings-form" id="createAsgForm">
      <label for="caType">Type</label>
      <select id="caType" class="tool-select">
        <option value="homework">Homework</option>
        <option value="assignment">Assignment</option>
      </select>
      <span class="date-hint">Weekly tests are posted in Weekly Test, not here.</span>
      <label for="caCourse">Course</label>
      <select id="caCourse" class="tool-select" required>
        <option value="">Choose a course…</option>
        ${COURSES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
      </select>
      <label for="caTitle">Title</label>
      <input type="text" id="caTitle" required placeholder="e.g. Homework 2 — Causes of the War of Independence">
      <label for="caQuestion">Question or instructions (optional)</label>
      <textarea id="caQuestion" rows="4" maxlength="5000" placeholder="Write the question here, or attach a PDF below, or both"></textarea>
      <label for="caFile">Assignment PDF (optional)</label>
      <input type="file" id="caFile" accept="application/pdf">
      <label for="caDue">Due date</label>
      <input type="date" id="caDue" class="tool-select" required>
      <span class="date-hint">Work uploaded after this day is flagged Late.</span>
      <label for="caLast">Last upload date (optional)</label>
      <input type="date" id="caLast" class="tool-select">
      <span class="date-hint">After this day students can't upload any more. Leave it empty to keep uploads open.</span>
      <label for="caMax">Max marks</label>
      <input type="number" id="caMax" required min="1" value="10">
      <p class="auth-error" id="caError" hidden></p>
      <button type="submit" class="btn btn-primary">Post to students</button>
    </form>

    <h3 class="list-title spaced">Posted</h3>
    <ul class="asg-list">
      ${assignments.map((a) => `
      <li class="upload-item">
        <span class="u-info">
          <strong></strong>
          <small>${TYPE_LABEL[a.type] || a.type} · ${esc(audienceLabel(a.subjects))} · due ${fmtDue(a.due_date)}${a.last_upload_date ? ` · last upload ${fmtDue(a.last_upload_date)}` : ""} · out of ${a.max_marks} · ${subCounts[a.id] || 0} submitted · ${markCounts[a.id] || 0} marked${a.file_path ? " · PDF attached" : ""}</small>
        </span>
        <button class="btn btn-outline btn-sm" data-open-asg="${a.id}">Open →</button>
      </li>`).join("")}
    </ul>
    ${assignments.length ? "" : '<p class="empty-note">Nothing posted to this cohort yet — post your first homework above.</p>'}`;

  area.querySelectorAll(".u-info strong").forEach((el, i) => {
    el.textContent = assignments[i].title;
  });
}

async function renderMarkingView() {
  const area = $("assignmentsArea");
  const { data: a, error } = await supabase.from("assignments").select("*").eq("id", openAssignmentId).single();
  if (error || !a) {
    openAssignmentId = null;
    return renderListView();
  }
  currentAsg = a;
  $("asgHint").textContent = `${TYPE_LABEL[a.type] || a.type} · ${audienceLabel(a.subjects)} · due ${fmtDue(a.due_date)}${a.last_upload_date ? ` · last upload ${fmtDue(a.last_upload_date)}` : ""} · out of ${a.max_marks}`;

  const [{ data: allStudents }, { data: subs }, { data: mks }] = await Promise.all([
    supabase.from("students").select("id, name, initials, subjects").eq("cohort_id", a.cohort_id).order("name"),
    supabase.from("submissions").select("*").eq("assignment_id", a.id),
    supabase.from("marks").select("*").eq("assignment_id", a.id),
  ]);

  const subBy = {};
  (subs || []).forEach((s) => { subBy[s.student_id] = s; });
  const markBy = {};
  (mks || []).forEach((m) => { markBy[m.student_id] = m; });

  // Only students enrolled in a subject this assignment is aimed at.
  const students = (allStudents || []).filter((st) => isFor(st, a));

  const rows = students.map((st) => {
    const sub = subBy[st.id];
    const mark = markBy[st.id];
    const status = sub
      ? (isLate(sub.submitted_at, a.due_date)
          ? '<span class="status-pill late">Late</span>'
          : '<span class="status-pill ontime">Submitted</span>')
      : '<span class="status-pill muted">Not submitted</span>';
    const files = sub && sub.file_paths.length
      ? sub.file_paths.map((p, i) => `<button class="btn btn-outline btn-sm" data-file-path="${esc(p)}">File ${i + 1}</button>`).join(" ")
      : "—";
    return `
    <tr data-student-id="${st.id}">
      <td data-label="Student"><span class="student-cell"><span class="avatar-initials sm">${esc(st.initials)}</span>${esc(st.name)}</span></td>
      <td data-label="Status">${status}</td>
      <td data-label="Files"><span class="asg-files">${files}</span></td>
      <td data-label="Marks"><input type="number" class="mark-input" min="0" max="${a.max_marks}" value="${mark ? mark.marks : ""}" placeholder="/${a.max_marks}"></td>
      <td data-label="Feedback"><input type="text" class="mark-feedback" value="${mark && mark.feedback ? esc(mark.feedback) : ""}" placeholder="Feedback (optional)"></td>
      <td><button class="btn btn-primary btn-sm" data-save-mark="${st.id}">${mark ? "Update" : "Save"}</button></td>
    </tr>`;
  }).join("");

  // What she attached (the question and/or a PDF) and the two dates. The date form only appears once the new
  // fields exist in the database (a row from before that has no last_upload_date key at all).
  const brief = a.question || a.file_path
    ? `<div class="asg-brief">${a.question ? '<p class="asg-question"></p>' : ""}${a.file_path ? '<button type="button" class="btn btn-outline btn-sm" data-view-asg-pdf>View assignment PDF</button>' : ""}</div>`
    : "";
  const dates = "last_upload_date" in a
    ? `<form class="wt-edit" id="asgDatesForm">
      <div class="wt-edit-field">
        <label for="asgEditDue">Due date</label>
        <input type="date" id="asgEditDue" required value="${a.due_date}">
      </div>
      <div class="wt-edit-field">
        <label for="asgEditLast">Last upload date</label>
        <input type="date" id="asgEditLast" value="${a.last_upload_date || ""}">
      </div>
      <button type="submit" class="btn btn-primary btn-sm">Save dates</button>
      <span class="date-hint">Work uploaded after the due date is flagged Late. After the last upload date students can't upload any more; leave it empty to keep uploads open. Changing it reopens or closes uploads straight away.</span>
    </form>`
    : '<p class="date-hint">Run supabase/migrations/assignment-question-pdf.sql once to add last upload dates, questions and PDFs.</p>';

  area.innerHTML = `
    <div class="asg-detail-head">
      <button class="btn btn-outline btn-sm" data-back-asg>← All assignments</button>
      <strong class="asg-detail-title"></strong>
      <button class="btn btn-outline btn-sm asg-delete" data-delete-asg>Delete</button>
    </div>
    ${brief}
    ${dates}
    <div class="course-retag">
      <label for="asgCourse">Course</label>
      ${courseSelectHTML("asgCourse", a.subjects)}
      <span class="date-hint">Only students taking this course are listed, and its marks count on that course's scoreboard.</span>
    </div>
    <div class="table-wrap">
      <table class="sub-table">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Status</th>
            <th scope="col">Files</th>
            <th scope="col">Marks</th>
            <th scope="col">Feedback</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${students.length ? "" : `<p class="empty-note">No students in this cohort are taking ${esc(audienceLabel(a.subjects))}.</p>`}`;

  area.querySelector(".asg-detail-title").textContent = a.title;
  if (a.question) area.querySelector(".asg-question").textContent = a.question;
}

$("assignmentsArea").addEventListener("submit", async (e) => {
  // Change the due date / last upload date of the assignment that is open
  if (e.target.id === "asgDatesForm") {
    e.preventDefault();
    const due = $("asgEditDue").value;
    const last = $("asgEditLast").value;
    if (!due) return showToast("Due date needed", "Pick the due date.");
    if (last && last < due) return showToast("Check the dates", "The last upload date can't be before the due date.");
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const { error } = await supabase.from("assignments").update({ due_date: due, last_upload_date: last || null }).eq("id", openAssignmentId);
    btn.disabled = false;
    if (error) return showToast("Couldn't save", friendlyError(error, "Please try again."));
    showToast("Dates saved", last ? "Students can upload until the last upload date." : "Uploads stay open (no last upload date).");
    await renderMarkingView();
    return;
  }

  if (e.target.id !== "createAsgForm") return;
  e.preventDefault();
  $("caError").hidden = true;

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  let path = null;
  try {
    const course = $("caCourse").value;
    if (!course) throw new Error("Choose which course this is for.");
    const due = $("caDue").value;
    const last = $("caLast").value;
    if (last && last < due) throw new Error("The last upload date can't be before the due date.");
    const file = $("caFile").files[0];
    if (file && file.type !== "application/pdf") throw new Error("Only PDF files are supported.");
    const question = $("caQuestion").value.trim();

    if (file) {
      path = `${activeCohort}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(PDF_BUCKET).upload(path, file);
      if (uploadError) { path = null; throw uploadError; }
    }

    const row = {
      cohort_id: activeCohort,
      type: $("caType").value,
      title: $("caTitle").value.trim(),
      due_date: due,
      max_marks: Number($("caMax").value),
      subjects: subjectsForCourses([course]),
    };
    if (question) row.question = question;
    if (path) row.file_path = path;
    if (last) row.last_upload_date = last;
    const { error } = await supabase.from("assignments").insert(row);
    if (error) throw error;
    showToast("Posted", `Now visible to ${COHORT_DATA[activeCohort].name} students.`);
    await renderListView();
  } catch (err) {
    // The row was not saved, so the PDF that was just uploaded would be left behind: remove it
    if (path) await supabase.storage.from(PDF_BUCKET).remove([path]);
    $("caError").textContent = friendlyError(err, "Couldn't post — please try again.");
    $("caError").hidden = false;
    btn.disabled = false;
  }
});

$("assignmentsArea").addEventListener("click", async (e) => {
  const openBtn = e.target.closest("[data-open-asg]");
  if (openBtn) {
    openAssignmentId = openBtn.dataset.openAsg;
    await renderMarkingView();
    return;
  }

  if (e.target.closest("[data-back-asg]")) {
    openAssignmentId = null;
    await renderListView();
    return;
  }

  const delBtn = e.target.closest("[data-delete-asg]");
  if (delBtn) {
    if (!confirm("Delete this assignment? All its submissions and marks go with it. This can't be undone.")) return;
    const pdfPath = currentAsg && currentAsg.id === openAssignmentId ? currentAsg.file_path : null;
    const { error } = await supabase.from("assignments").delete().eq("id", openAssignmentId);
    if (error) {
      showToast("Couldn't delete", error.message);
      return;
    }
    if (pdfPath) await supabase.storage.from(PDF_BUCKET).remove([pdfPath]);
    openAssignmentId = null;
    showToast("Assignment deleted", "Its submissions and marks were removed too.");
    await renderListView();
    return;
  }

  if (e.target.closest("[data-view-asg-pdf]")) {
    const pdfPath = currentAsg && currentAsg.file_path;
    const { data, error } = pdfPath ? await supabase.storage.from(PDF_BUCKET).createSignedUrl(pdfPath, 60) : { error: true };
    if (error || !data) {
      showToast("Couldn't open file", "Please try again in a moment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
    return;
  }

  const fileBtn = e.target.closest("[data-file-path]");
  if (fileBtn) {
    const { data, error } = await supabase.storage.from("submissions").createSignedUrl(fileBtn.dataset.filePath, 60);
    if (error || !data) {
      showToast("Couldn't open file", "Please try again in a moment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
    return;
  }

  const saveBtn = e.target.closest("[data-save-mark]");
  if (saveBtn) {
    const row = saveBtn.closest("tr");
    const marksVal = row.querySelector(".mark-input").value;
    if (marksVal === "") {
      showToast("No mark entered", "Type the marks first, then save.");
      return;
    }
    saveBtn.disabled = true;
    const { error } = await supabase.from("marks").upsert(
      {
        assignment_id: openAssignmentId,
        student_id: saveBtn.dataset.saveMark,
        marks: Number(marksVal),
        feedback: row.querySelector(".mark-feedback").value.trim() || null,
      },
      { onConflict: "assignment_id,student_id" }
    );
    saveBtn.disabled = false;
    if (error) {
      showToast("Couldn't save mark", error.message);
      return;
    }
    saveBtn.textContent = "Update";
    showToast("Mark saved", "The student can see it on their portal now.");
  }
});

$("assignmentsArea").addEventListener("change", async (e) => {
  if (e.target.id !== "asgCourse") return;
  e.target.disabled = true;
  const { error } = await supabase
    .from("assignments")
    .update({ subjects: subjectsForCourseChoice(e.target.value) })
    .eq("id", openAssignmentId);
  if (error) {
    e.target.disabled = false;
    showToast("Couldn't change the course", error.message);
    return;
  }
  showToast("Course updated", "The student list and scoreboard now follow the new course.");
  await renderMarkingView();
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    openAssignmentId = null;
    renderArea();
  })
);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "assignments") renderArea();
});

window.dataReadyPromise.then(renderArea);
