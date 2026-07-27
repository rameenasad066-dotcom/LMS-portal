/* Real teacher dashboard (teacher.html, #dashboard) — replaces the demo-era
   widgets (fake Quick-Publish dock, hardcoded "Recent Uploads", always-zero
   Pending Review, empty Needs-Attention stub). Everything here is computed
   live from the real progress-system tables (assignments/submissions/marks/
   attendance/notes), cohort-scoped to the active pill. Runs as a module and
   re-renders on cohort switch, same pattern as teacher-roster.js et al.
   Reads globals from teacher.js: activeCohort, COHORT_DATA, esc, subjectName. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const TYPE_LABEL = { homework: "Homework", assignment: "Assignment", test: "Test" };

function daysUntil(dueDate) {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
}

function deadlineLabel(dueDate) {
  const d = daysUntil(dueDate);
  if (d < 0) return { text: `Overdue · ${fmtDate(dueDate)}`, cls: "late" };
  if (d === 0) return { text: "Due today", cls: "late" };
  if (d === 1) return { text: "Due tomorrow", cls: "ontime" };
  return { text: `Due in ${d} days`, cls: "ontime" };
}

async function renderDashboard() {
  const cohort = activeCohort;

  const [{ data: assignments }, { data: students }, { data: notes }] = await Promise.all([
    supabase.from("assignments").select("*").eq("cohort_id", cohort).order("due_date", { ascending: true }),
    supabase.from("students").select("id, name, initials").eq("cohort_id", cohort),
    supabase.from("notes").select("*").eq("cohort_id", cohort).order("created_at", { ascending: false }).limit(5),
  ]);

  const asgList = assignments || [];
  const studentList = students || [];
  const assignmentIds = asgList.map((a) => a.id);

  const [{ data: submissions }, { data: marks }, { data: attendance }] = await Promise.all([
    assignmentIds.length
      ? supabase.from("submissions").select("assignment_id, student_id, submitted_at").in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [] }),
    assignmentIds.length
      ? supabase.from("marks").select("assignment_id, student_id, marks").in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [] }),
    supabase.from("attendance").select("student_id, status, class_date").eq("cohort_id", cohort),
  ]);

  const subList = submissions || [];
  const markList = marks || [];
  const attList = attendance || [];

  const asgById = {};
  asgList.forEach((a) => { asgById[a.id] = a; });
  const studentById = {};
  studentList.forEach((s) => { studentById[s.id] = s; });
  const markKey = new Set(markList.map((m) => `${m.assignment_id}:${m.student_id}`));

  /* ---- Submissions to mark ---- */
  const toMark = subList.filter((s) => !markKey.has(`${s.assignment_id}:${s.student_id}`));
  $("dashToMark").textContent = String(toMark.length);
  $("dashToMarkSub").textContent = toMark.length
    ? "waiting for a grade"
    : "all caught up";

  /* ---- Attendance nudge ---- */
  const markedToday = attList.some((r) => r.class_date === todayISO());
  const nudge = $("attnAttendance");
  nudge.hidden = !studentList.length || markedToday;

  /* ---- Needs attention (real: low average or low attendance) ---- */
  const marksByStudent = {};
  markList.forEach((m) => {
    const max = asgById[m.assignment_id] && asgById[m.assignment_id].max_marks;
    if (!max) return;
    (marksByStudent[m.student_id] ||= []).push((100 * m.marks) / max);
  });
  const attByStudent = {};
  attList.forEach((r) => { (attByStudent[r.student_id] ||= []).push(r.status); });

  const flagged = [];
  studentList.forEach((s) => {
    const pcts = marksByStudent[s.id] || [];
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    // "Leave" is an excused absence — excluded from the % entirely.
    const att = (attByStudent[s.id] || []).filter((x) => x !== "leave");
    const attPct = att.length ? Math.round((100 * att.filter((x) => x === "present").length) / att.length) : null;

    const reasons = [];
    if (avg !== null && avg < 60) reasons.push(`Avg ${avg}%`);
    if (attPct !== null && attPct < 67) reasons.push(`Attendance ${attPct}%`);
    if (reasons.length) flagged.push({ name: s.name, initials: s.initials, reason: reasons.join(" · ") });
  });

  $("needsAttentionEmpty").hidden = flagged.length > 0;
  $("needsAttentionList").innerHTML = flagged.map((r) => `
    <a class="attn-row" href="#students">
      <span class="avatar-initials sm">${esc(r.initials)}</span>
      <span class="attn-row-body">
        <strong>${esc(r.name)}</strong>
        <small>${esc(r.reason)}</small>
      </span>
      <svg class="attn-row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
    </a>`).join("");

  /* ---- Recent submissions ---- */
  const recent = subList
    .slice()
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 5);
  $("dashRecentEmpty").hidden = recent.length > 0;
  $("dashRecentList").innerHTML = recent.map((s) => {
    const student = studentById[s.student_id];
    const asg = asgById[s.assignment_id];
    const marked = markKey.has(`${s.assignment_id}:${s.student_id}`);
    const late = asg && new Date(s.submitted_at) > new Date(asg.due_date + "T23:59:59");
    return `
    <li class="upload-item">
      <span class="avatar-initials sm">${esc(student ? student.initials : "?")}</span>
      <span class="u-info">
        <strong>${esc(student ? student.name : "Unknown")}</strong>
        <small>${esc(asg ? asg.title : "Assignment")} · ${fmtDate(s.submitted_at)}${late ? " · Late" : ""}</small>
      </span>
      <span class="status-pill ${marked ? "ontime" : "muted"}">${marked ? "Marked" : "To mark"}</span>
    </li>`;
  }).join("");

  /* ---- Deadlines (nearest first, overdue flagged) ---- */
  const deadlines = asgList
    .slice()
    .sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date))
    .slice(0, 5);
  $("dashDeadlineEmpty").hidden = deadlines.length > 0;
  $("dashDeadlineList").innerHTML = deadlines.map((a) => {
    const dl = deadlineLabel(a.due_date);
    return `
    <li class="upload-item">
      <span class="cat-tag">${TYPE_LABEL[a.type] || a.type}</span>
      <span class="u-info">
        <strong>${esc(a.title)}</strong>
        <small>Out of ${a.max_marks}</small>
      </span>
      <span class="status-pill ${dl.cls}">${dl.text}</span>
    </li>`;
  }).join("");

  /* ---- Recent notes ---- */
  const noteList = notes || [];
  $("dashNotesEmpty").hidden = noteList.length > 0;
  $("dashNotesList").innerHTML = noteList.map((n) => `
    <li class="upload-item">
      <span class="file-chip">${ICONS.pdf}</span>
      <span class="u-info">
        <strong>${esc(n.title)}</strong>
        <small>${esc(subjectName(n.subject))} · ${fmtDate(n.created_at)}</small>
      </span>
      <span class="u-kind">PDF</span>
    </li>`).join("");
}

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderDashboard)
);

window.dataReadyPromise.then(renderDashboard);
