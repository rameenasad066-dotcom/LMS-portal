/* Manual Attendance (Attendance view, teacher.html) — progress system
   Phase 4. Rameen picks a subject and a date (defaults to today, never
   future — no Zoom/WhatsApp integration, this is just her record of who
   showed up) and marks each student present/leave/absent for that class.
   "Leave" is an excused absence — it's excluded from the attendance %
   entirely (attendanceSummary() in progress-utils.js), unlike a plain
   Absent which counts against it. Clicking a status button upserts
   immediately rather than a big form-submit, since a live roll-call is
   naturally an immediate-tap interaction.

   Subject-specific since 2026-10-05 (attendance-subjects.sql): each row is
   tagged with the COURSE the class was for, one row per class_date ×
   student × subject, and only students enrolled in the chosen course are
   listed — so nobody is ever marked for a class they don't take. Rows
   marked before subjects existed have subject = null; they're shown faded,
   and tapping a status for such a student replaces the untagged row with a
   tagged one so the same class is never counted twice. */

import { supabase, COURSES, coursesForSubjects } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const STATUSES = ["present", "leave", "absent"];
const STATUS_LABEL = { present: "Present", leave: "Leave", absent: "Absent" };
const COURSE_SHORT = { pakstudies: "PST", islamiyat: "ISL" };

// Student ids with an untagged (legacy) row for the date being shown.
let legacyIds = new Set();
// Bumped on every render so a slow response for a previous subject/date
// can't overwrite the list for the one now selected.
let renderSeq = 0;

function todayISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

function courseName(id) {
  const c = COURSES.find((x) => x.id === id);
  return c ? c.name : id;
}

$("attSubject").insertAdjacentHTML(
  "beforeend",
  COURSES.map((c) => `<option value="${c.id}">${c.name} / ${COURSE_SHORT[c.id] || c.id.toUpperCase()}</option>`).join("")
);

function showMessage(text) {
  $("attBody").innerHTML = "";
  $("attTableWrap").hidden = true;
  $("attLegacyNote").hidden = true;
  $("attEmpty").hidden = false;
  $("attEmpty").textContent = text;
}

async function renderAttendance() {
  const seq = ++renderSeq;
  const dateInput = $("attDate");
  if (!dateInput.value) dateInput.value = todayISO();
  const classDate = dateInput.value;
  const subject = $("attSubject").value;
  const hint = $("attHint");

  if (!subject) {
    hint.textContent = "";
    showMessage("Choose a subject to take attendance — only students enrolled in it will be listed.");
    return;
  }

  const [{ data: students, error: studentsErr }, { data: records, error: recordsErr }] = await Promise.all([
    supabase.from("students").select("id, name, initials, subjects").eq("cohort_id", activeCohort).order("name"),
    supabase
      .from("attendance")
      .select("student_id, status, subject")
      .eq("cohort_id", activeCohort)
      .eq("class_date", classDate)
      .or(`subject.eq.${subject},subject.is.null`),
  ]);
  if (seq !== renderSeq) return;

  if (studentsErr || recordsErr) {
    hint.textContent = "";
    showMessage(`Couldn't load attendance: ${(studentsErr || recordsErr).message}`);
    return;
  }

  const enrolled = students.filter((s) => coursesForSubjects(s.subjects).includes(subject));
  hint.textContent = `${enrolled.length} of ${students.length} student${students.length === 1 ? "" : "s"} in ${COHORT_DATA[activeCohort].name} take ${courseName(subject)}`;

  if (!enrolled.length) {
    showMessage(`No students in this cohort take ${courseName(subject)}.`);
    return;
  }

  const tagged = {};
  const legacy = {};
  (records || []).forEach((r) => {
    if (r.subject) tagged[r.student_id] = r.status;
    else legacy[r.student_id] = r.status;
  });
  legacyIds = new Set(enrolled.filter((s) => legacy[s.id] && !tagged[s.id]).map((s) => s.id));

  $("attEmpty").hidden = true;
  $("attTableWrap").hidden = false;
  const note = $("attLegacyNote");
  note.hidden = legacyIds.size === 0;
  note.textContent = `${legacyIds.size} student${legacyIds.size === 1 ? " was" : "s were"} marked on this day before attendance had subjects — shown faded. Tapping a status tags it as ${courseName(subject)}.`;

  $("attBody").innerHTML = enrolled.map((s) => {
    const current = tagged[s.id] || legacy[s.id];
    const isLegacy = legacyIds.has(s.id);
    return `
    <tr data-student-id="${s.id}">
      <td data-label="Student"><span class="student-cell"><span class="avatar-initials sm">${esc(s.initials)}</span>${esc(s.name)}</span></td>
      <td data-label="Status">
        <div class="att-toggle">
          ${STATUSES.map((st) => `<button type="button" class="att-btn ${st} ${current === st ? "active" : ""} ${current === st && isLegacy ? "legacy" : ""}" data-status="${st}" data-student="${s.id}"${current === st && isLegacy ? ' title="Marked before attendance had subjects"' : ""}>${STATUS_LABEL[st]}</button>`).join("")}
        </div>
      </td>
    </tr>`;
  }).join("");
}

$("attBody").addEventListener("click", async (e) => {
  const btn = e.target.closest(".att-btn");
  if (!btn) return;

  const subject = $("attSubject").value;
  if (!subject) return;
  const studentId = btn.dataset.student;
  const status = btn.dataset.status;
  const classDate = $("attDate").value;

  btn.closest(".att-toggle").querySelectorAll(".att-btn").forEach((b) => b.classList.remove("active", "legacy"));
  btn.classList.add("active");

  const { error } = await supabase.from("attendance").upsert(
    { cohort_id: activeCohort, class_date: classDate, student_id: studentId, subject, status },
    { onConflict: "class_date,student_id,subject" }
  );
  if (error) {
    showToast("Couldn't save attendance", error.message || "Please try again.");
    renderAttendance();
    return;
  }

  // The tagged row now stands for this class — drop the untagged one so the
  // same day isn't counted twice.
  if (legacyIds.has(studentId)) {
    const { error: delError } = await supabase
      .from("attendance")
      .delete()
      .eq("class_date", classDate)
      .eq("student_id", studentId)
      .is("subject", null);
    if (delError) showToast("Saved, but couldn't tidy the old mark", delError.message);
    renderAttendance();
  }
});

$("attSubject").addEventListener("change", renderAttendance);
$("attDate").addEventListener("change", renderAttendance);
document.querySelectorAll(".pill").forEach((pill) => pill.addEventListener("click", renderAttendance));

document.addEventListener("swr-view", (e) => {
  if (e.detail === "attendance") renderAttendance();
});

window.dataReadyPromise.then(() => {
  $("attDate").max = todayISO();
  renderAttendance();
});
