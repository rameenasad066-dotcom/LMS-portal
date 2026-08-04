/* Manual Attendance (Attendance view, teacher.html) — progress system
   Phase 4. Rameen picks a date (defaults to today, never future — no
   Zoom/WhatsApp integration, this is just her record of who showed up)
   and marks each active-cohort student present/leave/absent for that day's
   class. "Leave" is an excused absence — it's excluded from the attendance
   % entirely (see attendancePct() in student-grades.js / teacher-student-
   report.js), unlike a plain Absent which counts against it. Clicking a
   status button upserts immediately (one row per class_date × student,
   unique constraint in attendance.sql) rather than a big form-submit,
   since a live roll-call is naturally an immediate-tap interaction. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const STATUSES = ["present", "leave", "absent"];
const STATUS_LABEL = { present: "Present", leave: "Leave", absent: "Absent" };

function todayISO() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

async function renderAttendance() {
  const dateInput = $("attDate");
  if (!dateInput.value) dateInput.value = todayISO();
  const classDate = dateInput.value;

  const body = $("attBody");
  const empty = $("attEmpty");
  const hint = $("attHint");

  const [{ data: students, error: studentsErr }, { data: records }] = await Promise.all([
    supabase.from("students").select("*").eq("cohort_id", activeCohort).order("name"),
    supabase.from("attendance").select("*").eq("cohort_id", activeCohort).eq("class_date", classDate),
  ]);

  if (studentsErr) {
    body.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load students: ${studentsErr.message}`;
    return;
  }

  empty.hidden = students.length > 0;
  hint.textContent = `${students.length} student${students.length === 1 ? "" : "s"} in ${COHORT_DATA[activeCohort].name}`;

  const statusBy = {};
  (records || []).forEach((r) => { statusBy[r.student_id] = r.status; });

  body.innerHTML = students.map((s) => `
    <tr data-student-id="${s.id}">
      <td data-label="Student"><span class="student-cell"><span class="avatar-initials sm">${esc(s.initials)}</span>${esc(s.name)}</span></td>
      <td data-label="Status">
        <div class="att-toggle">
          ${STATUSES.map((st) => `<button type="button" class="att-btn ${st} ${statusBy[s.id] === st ? "active" : ""}" data-status="${st}" data-student="${s.id}">${STATUS_LABEL[st]}</button>`).join("")}
        </div>
      </td>
    </tr>`).join("");
}

$("attBody").addEventListener("click", async (e) => {
  const btn = e.target.closest(".att-btn");
  if (!btn) return;

  const studentId = btn.dataset.student;
  const status = btn.dataset.status;
  const classDate = $("attDate").value;

  btn.closest(".att-toggle").querySelectorAll(".att-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  const { error } = await supabase.from("attendance").upsert(
    {
      cohort_id: activeCohort,
      class_date: classDate,
      student_id: studentId,
      status,
    },
    { onConflict: "class_date,student_id" }
  );

  if (error) {
    showToast("Couldn't save attendance", error.message || "Please try again.");
    renderAttendance();
  }
});

$("attDate").addEventListener("change", renderAttendance);
document.querySelectorAll(".pill").forEach((pill) => pill.addEventListener("click", renderAttendance));

document.addEventListener("swr-view", (e) => {
  if (e.detail === "attendance") renderAttendance();
});

window.dataReadyPromise.then(() => {
  $("attDate").max = todayISO();
  renderAttendance();
});
