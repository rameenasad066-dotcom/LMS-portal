/* Assignments & marking (teacher.html) — Phase 1 of the progress system.
   Post homework/assignments/tests to the active cohort, see who submitted,
   open their files, and enter marks (+ optional feedback). Marks can be
   entered without a portal submission too, since weekly tests arrive on
   WhatsApp. Runs as a module — see teacher-auth-guard.js for the
   script-order reasoning. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { homework: "Homework", assignment: "Assignment", test: "Test" };

let openAssignmentId = null;

function fmtDue(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isLate(submittedAt, dueDate) {
  return new Date(submittedAt) > new Date(dueDate + "T23:59:59");
}

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
        <option value="test">Test</option>
      </select>
      <label for="caTitle">Title</label>
      <input type="text" id="caTitle" required placeholder="e.g. Homework 2 — Causes of the War of Independence">
      <label for="caDue">Due date</label>
      <input type="date" id="caDue" class="tool-select" required>
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
          <small>${TYPE_LABEL[a.type] || a.type} · due ${fmtDue(a.due_date)} · out of ${a.max_marks} · ${subCounts[a.id] || 0} submitted · ${markCounts[a.id] || 0} marked</small>
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
  $("asgHint").textContent = `${TYPE_LABEL[a.type] || a.type} · due ${fmtDue(a.due_date)} · out of ${a.max_marks}`;

  const [{ data: students }, { data: subs }, { data: mks }] = await Promise.all([
    supabase.from("students").select("id, name, initials").eq("cohort_id", a.cohort_id).order("name"),
    supabase.from("submissions").select("*").eq("assignment_id", a.id),
    supabase.from("marks").select("*").eq("assignment_id", a.id),
  ]);

  const subBy = {};
  (subs || []).forEach((s) => { subBy[s.student_id] = s; });
  const markBy = {};
  (mks || []).forEach((m) => { markBy[m.student_id] = m; });

  const rows = (students || []).map((st) => {
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
      <td><span class="student-cell"><span class="avatar-initials sm">${esc(st.initials)}</span>${esc(st.name)}</span></td>
      <td>${status}</td>
      <td><span class="asg-files">${files}</span></td>
      <td><input type="number" class="mark-input" min="0" max="${a.max_marks}" value="${mark ? mark.marks : ""}" placeholder="/${a.max_marks}"></td>
      <td><input type="text" class="mark-feedback" value="${mark && mark.feedback ? esc(mark.feedback) : ""}" placeholder="Feedback (optional)"></td>
      <td><button class="btn btn-primary btn-sm" data-save-mark="${st.id}">${mark ? "Update" : "Save"}</button></td>
    </tr>`;
  }).join("");

  area.innerHTML = `
    <div class="asg-detail-head">
      <button class="btn btn-outline btn-sm" data-back-asg>← All assignments</button>
      <strong class="asg-detail-title"></strong>
      <button class="btn btn-outline btn-sm asg-delete" data-delete-asg>Delete</button>
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
    ${(students || []).length ? "" : '<p class="empty-note">No students in this cohort yet.</p>'}`;

  area.querySelector(".asg-detail-title").textContent = a.title;
}

$("assignmentsArea").addEventListener("submit", async (e) => {
  if (e.target.id !== "createAsgForm") return;
  e.preventDefault();
  $("caError").hidden = true;

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const { error } = await supabase.from("assignments").insert({
      cohort_id: activeCohort,
      type: $("caType").value,
      title: $("caTitle").value.trim(),
      due_date: $("caDue").value,
      max_marks: Number($("caMax").value),
    });
    if (error) throw error;
    showToast("Posted", `Now visible to ${COHORT_DATA[activeCohort].name} students.`);
    await renderListView();
  } catch (err) {
    $("caError").textContent = err.message || "Couldn't post — please try again.";
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
    const { error } = await supabase.from("assignments").delete().eq("id", openAssignmentId);
    if (error) {
      showToast("Couldn't delete", error.message);
      return;
    }
    openAssignmentId = null;
    showToast("Assignment deleted", "Its submissions and marks were removed too.");
    await renderListView();
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

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    openAssignmentId = null;
    renderArea();
  })
);

window.dataReadyPromise.then(renderArea);
