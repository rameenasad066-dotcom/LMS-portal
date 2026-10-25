/* Examiner Scripts (teacher.html) — post a marked script as one PDF with its
   marks and grade, scoped to the active cohort and one course. Students see
   these as grade-first cards and read the PDF inside the portal (see
   student-examiner-scripts.js). Posting, editing and deleting all live here;
   the database rules are in supabase/migrations/examiner-scripts.sql.
   Runs as a module, chained off window.dataReadyPromise like the other
   teacher modules. */

import { supabase, COURSES, subjectsForCourses, coursesForSubjects, courseLabel } from "./supabase-config.js";
import { safeFileName } from "./storage-upload.js";

const $ = (id) => document.getElementById(id);
const BUCKET = "examiner-scripts";
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const GRADES = ["A*", "A", "B", "C", "D", "E", "U"];

let scripts = [];
let editingId = null;
let gradeTouched = false;

function suggestGrade(marks, max) {
  if (!(max > 0) || !Number.isFinite(marks)) return "";
  const p = (100 * marks) / max;
  return p >= 90 ? "A*" : p >= 80 ? "A" : p >= 70 ? "B" : p >= 60 ? "C" : p >= 50 ? "D" : p >= 40 ? "E" : "U";
}

function gradeTone(g) {
  return g === "A*" || g === "A" ? "top" : g === "B" || g === "C" ? "mid" : "low";
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function cardHTML(s) {
  const pct = Math.round((100 * s.marks) / s.max_marks);
  const tone = gradeTone(s.grade);
  return `
  <article class="xs-card" data-script-id="${s.id}">
    <span class="xs-grade ${tone === "mid" ? "" : tone}">${esc(s.grade)}</span>
    <div class="xs-body">
      <h3></h3>
      <div class="xs-meta">${esc(courseLabel(s.subjects))}${s.session ? ` · ${esc(s.session)}` : ""} · added ${fmtDate(s.created_at)}</div>
      <div class="xs-marks"><span>Marks</span><b>${s.marks} / ${s.max_marks}</b></div>
      <div class="xs-track"><div class="xs-fill ${tone === "top" ? "top" : ""}" style="width:${pct}%"></div></div>
    </div>
    <div class="xs-actions">
      <button type="button" class="btn btn-outline btn-sm" data-xs-view="${s.id}">View</button>
      <button type="button" class="btn btn-outline btn-sm" data-xs-edit="${s.id}">Edit</button>
      <button type="button" class="btn btn-outline btn-sm asg-delete" data-xs-delete="${s.id}">Delete</button>
    </div>
  </article>`;
}

function formHTML(s) {
  const course = s ? coursesForSubjects(s.subjects)[0] || "" : "";
  const grade = s ? s.grade : "";
  return `
  <form class="settings-form" id="xsForm" novalidate>
    <label for="xsCourse">Course</label>
    <select id="xsCourse" class="tool-select" required>
      <option value="">Choose a course…</option>
      ${COURSES.map((c) => `<option value="${c.id}"${c.id === course ? " selected" : ""}>${c.name}</option>`).join("")}
    </select>
    <label for="xsTitle">Paper / title</label>
    <input type="text" id="xsTitle" required maxlength="120" placeholder="e.g. Paper 1 · History &amp; Culture">
    <label for="xsSession">Exam session <span class="date-hint">(optional)</span></label>
    <input type="text" id="xsSession" maxlength="40" placeholder="e.g. Nov 2025">
    <label for="xsMarks">Marks attained</label>
    <input type="number" id="xsMarks" min="0" step="1" required value="${s ? s.marks : ""}">
    <label for="xsMax">Out of</label>
    <input type="number" id="xsMax" min="1" step="1" required value="${s ? s.max_marks : 60}">
    <label for="xsGrade">Grade</label>
    <select id="xsGrade" class="tool-select" required>
      <option value="">Choose a grade…</option>
      ${GRADES.map((g) => `<option value="${g}"${g === grade ? " selected" : ""}>${g}</option>`).join("")}
    </select>
    <span class="date-hint">Filled in from the marks as a starting point. Change it if the examiner's boundary says otherwise.</span>
    <label for="xsFile">${s ? "Replace the PDF <span class=\"date-hint\">(optional)</span>" : "Script (PDF)"}</label>
    <input type="file" id="xsFile" accept="application/pdf"${s ? "" : " required"}>
    <span class="date-hint">One PDF per script, up to 40 MB. Students read it inside the portal.</span>
    <p class="auth-error" id="xsError" hidden></p>
    <div class="page-head-actions">
      <button type="submit" class="btn btn-primary" id="xsSubmit">${s ? "Save changes" : "Post to students"}</button>
      ${s ? '<button type="button" class="btn btn-outline" data-xs-cancel>Cancel</button>' : ""}
    </div>
  </form>`;
}

function render() {
  const area = $("xsArea");
  if (!area) return;
  const editing = editingId ? scripts.find((s) => s.id === editingId) : null;
  $("xsHint").textContent = `Posts to ${COHORT_DATA[activeCohort].name}`;

  area.innerHTML = `
    ${editing ? `<p class="date-hint xs-form-note">Editing "${esc(editing.title)}"</p>` : ""}
    ${formHTML(editing)}
    <h3 class="list-title spaced">Posted</h3>
    <div class="xs-grid" id="xsList">${scripts.map(cardHTML).join("")}</div>
    ${scripts.length ? "" : '<p class="empty-note">No scripts posted for this cohort yet.</p>'}`;

  area.querySelectorAll("[data-script-id]").forEach((el) => {
    const s = scripts.find((x) => x.id === el.dataset.scriptId);
    el.querySelector("h3").textContent = s.title;
  });
  if (editing) {
    $("xsTitle").value = editing.title;
    $("xsSession").value = editing.session || "";
  }
  gradeTouched = !!editing;
}

async function load() {
  const { data, error } = await supabase
    .from("examiner_scripts")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("created_at", { ascending: false });
  if (error) {
    $("xsArea").innerHTML = `<p class="empty-note">Couldn't load examiner scripts: ${esc(error.message)}</p>`;
    return;
  }
  scripts = data || [];
  if (editingId && !scripts.some((s) => s.id === editingId)) editingId = null;
  render();
}

function showError(msg) {
  const el = $("xsError");
  el.textContent = msg;
  el.hidden = false;
}

async function uploadPdf(file) {
  const path = `${activeCohort}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
  if (error) throw error;
  return path;
}

async function save(form) {
  $("xsError").hidden = true;
  const course = $("xsCourse").value;
  const title = $("xsTitle").value.trim();
  const session = $("xsSession").value.trim();
  const marks = Number($("xsMarks").value);
  const max = Number($("xsMax").value);
  const grade = $("xsGrade").value;
  const file = $("xsFile").files[0];
  const editing = editingId ? scripts.find((s) => s.id === editingId) : null;

  if (!course) return showError("Choose which course this script is for.");
  if (!title) return showError("Give the script a title, for example \"Paper 1 · History & Culture\".");
  if (!Number.isInteger(max) || max < 1) return showError("\"Out of\" must be a whole number, 1 or more.");
  if (!Number.isInteger(marks) || marks < 0 || marks > max) return showError(`Marks must be a whole number from 0 to ${max}.`);
  if (!GRADES.includes(grade)) return showError("Choose the grade.");
  if (!editing && !file) return showError("Choose the script PDF.");
  if (file && file.type !== "application/pdf") return showError("Only PDF files are supported.");
  if (file && file.size > MAX_FILE_BYTES) return showError("That PDF is over 40 MB. Compress it or split it and try again.");

  const btn = $("xsSubmit");
  btn.disabled = true;
  btn.textContent = "Saving…";
  let newPath = null;
  try {
    if (file) newPath = await uploadPdf(file);
    const fields = {
      subjects: subjectsForCourses([course]),
      title, session: session || null, marks, max_marks: max, grade,
    };
    if (editing) {
      const patch = newPath ? { ...fields, pdf_path: newPath, size_bytes: file.size } : fields;
      const { error } = await supabase.from("examiner_scripts").update(patch).eq("id", editing.id);
      if (error) throw error;
      if (newPath) await supabase.storage.from(BUCKET).remove([editing.pdf_path]);
      showToast("Saved", "Students see the updated script straight away.");
      editingId = null;
    } else {
      const { error } = await supabase.from("examiner_scripts").insert({
        cohort_id: activeCohort, ...fields, pdf_path: newPath, size_bytes: file.size,
      });
      if (error) throw error;
      showToast("Posted", `Now visible to ${COHORT_DATA[activeCohort].name} students taking ${courseLabel(fields.subjects)}.`);
    }
    await load();
  } catch (err) {
    if (newPath) await supabase.storage.from(BUCKET).remove([newPath]);
    showError(err.message || "Couldn't save — please try again.");
    btn.disabled = false;
    btn.textContent = editing ? "Save changes" : "Post to students";
  }
}

async function remove(id) {
  const s = scripts.find((x) => x.id === id);
  if (!s || !confirm(`Delete "${s.title}"? Students will no longer see it. This can't be undone.`)) return;
  const { error } = await supabase.from("examiner_scripts").delete().eq("id", id);
  if (error) {
    showToast("Couldn't delete", error.message);
    return;
  }
  await supabase.storage.from(BUCKET).remove([s.pdf_path]);
  showToast("Script deleted", "It's gone from the student portal.");
  if (editingId === id) editingId = null;
  await load();
}

async function view(id) {
  const s = scripts.find((x) => x.id === id);
  if (!s) return;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(s.pdf_path, 60);
  if (error || !data) {
    showToast("Couldn't open file", "Please try again in a moment.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

document.addEventListener("submit", (e) => {
  if (e.target.id !== "xsForm") return;
  e.preventDefault();
  save(e.target);
});

document.addEventListener("input", (e) => {
  if (e.target.id === "xsMarks" || e.target.id === "xsMax") {
    if (!gradeTouched) $("xsGrade").value = suggestGrade(Number($("xsMarks").value), Number($("xsMax").value));
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "xsGrade") gradeTouched = true;
});

document.addEventListener("click", (e) => {
  const area = $("xsArea");
  if (!area || !area.contains(e.target)) return;
  const viewBtn = e.target.closest("[data-xs-view]");
  if (viewBtn) return view(viewBtn.dataset.xsView);
  const delBtn = e.target.closest("[data-xs-delete]");
  if (delBtn) return remove(delBtn.dataset.xsDelete);
  const editBtn = e.target.closest("[data-xs-edit]");
  if (editBtn) {
    editingId = editBtn.dataset.xsEdit;
    render();
    $("xsForm").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (e.target.closest("[data-xs-cancel]")) {
    editingId = null;
    render();
  }
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    editingId = null;
    load();
  })
);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "scripts") load();
});

window.dataReadyPromise.then(load);
