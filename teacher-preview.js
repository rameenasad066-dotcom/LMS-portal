/* "View as a student" picker (teacher.html topnav). Rameen clicks the eye
   icon, picks a student from the active cohort, and student.html opens in
   a new tab with ?preview=<id>. auth-guard.js recognises the param + her
   teacher session and loads that student's profile so every page renders
   exactly as they see it. All mutating actions inside the preview
   (uploads, settings) are gated by STUDENT.isPreview.
   Runs as a module — see teacher-auth-guard.js for the script-order
   reasoning. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
let allStudents = [];

async function loadStudents() {
  const { data, error } = await supabase
    .from("students")
    .select("id, name, initials, cohort_id")
    .eq("cohort_id", activeCohort)
    .order("name");
  allStudents = error ? [] : (data || []);
  renderList();
}

function renderList() {
  const list = $("previewPickerList");
  const q = $("previewPickerSearch").value.trim().toLowerCase();
  const filtered = q
    ? allStudents.filter((s) => s.name.toLowerCase().includes(q))
    : allStudents;

  if (!filtered.length) {
    list.innerHTML = `<li class="preview-picker-empty">${allStudents.length ? "No matches." : "No students in this cohort yet."}</li>`;
    return;
  }

  list.innerHTML = filtered.map((s) => `
    <li>
      <button type="button" class="preview-picker-row" data-preview-open="${s.id}">
        <span class="avatar-initials sm">${esc(s.initials || "?")}</span>
        <span>${esc(s.name)}</span>
      </button>
    </li>`).join("");
}

function openPicker() {
  $("previewPicker").hidden = false;
  $("previewPickerSearch").value = "";
  loadStudents();
  setTimeout(() => $("previewPickerSearch").focus(), 0);
}

function closePicker() {
  $("previewPicker").hidden = true;
}

$("previewAsStudentBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if ($("previewPicker").hidden) openPicker();
  else closePicker();
});

$("previewPickerClose").addEventListener("click", closePicker);
$("previewPickerSearch").addEventListener("input", renderList);

$("previewPickerList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-preview-open]");
  if (!btn) return;
  const id = btn.dataset.previewOpen;
  window.open(`student.html?preview=${encodeURIComponent(id)}`, "_blank", "noopener");
  closePicker();
});

// Click-outside to close.
document.addEventListener("click", (e) => {
  const picker = $("previewPicker");
  if (picker.hidden) return;
  if (e.target.closest("#previewPicker") || e.target.closest("#previewAsStudentBtn")) return;
  closePicker();
});

// Re-fetch students when the active cohort changes so the picker always
// matches the pill.
document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    if (!$("previewPicker").hidden) loadStudents();
  })
);
