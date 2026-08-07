/* Per-student report page (Students view → click a student), progress
   system Phase 3. Teacher-only — students keep their simpler My Grades
   page. Unlike get_scoreboard(), this reads `marks`/`assignments` directly
   rather than through a SECURITY DEFINER function, because the "never
   expose raw marks" rule only protects student-from-student visibility;
   the teacher's own RLS policies already grant her full read access to
   every student's marks, so no privacy boundary needs crossing here. */

import { supabase, COURSES, subjectsForCourses, coursesForSubjects } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

/* Enrolment editor — she picks courses (Pakistan Studies / Islamiyat) and
   they expand to the subject ids stored on the student. Saves on tick with
   no confirm: it's instantly reversible and deletes nothing, unlike the
   cohort shift or Remove. */
let reportStudentId = null;

function renderCoursePicker(subjects) {
  const enrolled = coursesForSubjects(subjects);
  $("srCourses").innerHTML = COURSES.map((c) => `
    <label class="course-option ${enrolled.includes(c.id) ? "on" : ""}">
      <input type="checkbox" value="${c.id}" ${enrolled.includes(c.id) ? "checked" : ""}>
      <span>${c.name}</span>
    </label>`).join("");
}

$("srCourses").addEventListener("change", async (e) => {
  const box = e.target.closest("input[type=checkbox]");
  if (!box || !reportStudentId) return;

  const picker = $("srCourses");
  const chosen = [...picker.querySelectorAll("input:checked")].map((i) => i.value);
  if (!chosen.length) {
    box.checked = true;
    showToast("Keep at least one", "A student needs at least one subject.");
    return;
  }

  picker.querySelectorAll("input").forEach((i) => { i.disabled = true; });
  const { error } = await supabase
    .from("students")
    .update({ subjects: subjectsForCourses(chosen) })
    .eq("id", reportStudentId);
  picker.querySelectorAll("input").forEach((i) => { i.disabled = false; });

  if (error) {
    box.checked = !box.checked;
    showToast("Couldn't update subjects", error.message);
    return;
  }
  box.closest(".course-option").classList.toggle("on", box.checked);
  showToast("Subjects updated", "Their portal now matches this straight away.");
});

function letterGrade(pct) {
  if (pct >= 90) return { label: "A*", cls: "" };
  if (pct >= 80) return { label: "A", cls: "" };
  if (pct >= 70) return { label: "B", cls: "mid" };
  if (pct >= 60) return { label: "C", cls: "mid" };
  if (pct >= 50) return { label: "D", cls: "mid" };
  return { label: "U", cls: "risk" };
}

// Same equal-thirds logic as get_scoreboard() (scoreboard.sql): average the
// per-category (homework/assignment/test) points-earned/points-possible %,
// skipping any category with zero graded items rather than counting it as
// 0 — a category isn't averaged in until it exists. This "Average" stat is
// all-time (not month-scoped like the Scoreboard's rank), so it reflects
// the student's whole history, category-balanced the same way.
function equalThirdsAvg(items) {
  const byType = {};
  items.forEach((it) => {
    if (!byType[it.type]) byType[it.type] = { earned: 0, possible: 0 };
    byType[it.type].earned += it.marksVal;
    byType[it.type].possible += it.maxMarks;
  });
  const categoryPcts = Object.values(byType)
    .filter((c) => c.possible > 0)
    .map((c) => (100 * c.earned) / c.possible);
  return Math.round(categoryPcts.reduce((s, p) => s + p, 0) / categoryPcts.length);
}

function zoneColorFor(pct) {
  if (pct >= 80) return "var(--green)";
  if (pct >= 50) return "var(--gray)";
  return "var(--red)";
}

function fmtDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildChart(items) {
  const W = 640, H = 220, padL = 34, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const y = (pct) => padT + plotH * (1 - pct / 100);
  const x = (i) => items.length === 1 ? padL + plotW / 2 : padL + (plotW * i) / (items.length - 1);

  const zone = (from, to, color) => `<rect x="${padL}" y="${y(to)}" width="${plotW}" height="${y(from) - y(to)}" fill="${color}" opacity="0.08"/>`;

  const points = items.map((it, i) => ({ cx: x(i), cy: y(it.pct), pct: it.pct, title: it.title }));
  const polyline = points.map((p) => `${p.cx},${p.cy}`).join(" ");

  const gridlines = [0, 50, 80, 100].map((v) => `
    <line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="var(--gray-light)" stroke-width="1"/>
    <text x="${padL - 8}" y="${y(v) + 4}" font-size="10" fill="var(--gray)" text-anchor="end">${v}%</text>`).join("");

  const dots = points.map((p) => `
    <circle cx="${p.cx}" cy="${p.cy}" r="4.5" fill="${zoneColorFor(p.pct)}" stroke="var(--surface)" stroke-width="2">
      <title>${p.title} — ${p.pct}%</title>
    </circle>`).join("");

  return `
  <svg viewBox="0 0 ${W} ${H}" class="report-chart-svg" role="img" aria-label="Marks over time">
    ${zone(80, 100, "var(--green)")}
    ${zone(50, 80, "var(--gray)")}
    ${zone(0, 50, "var(--red)")}
    ${gridlines}
    <polyline points="${polyline}" fill="none" stroke="var(--red)" stroke-width="2.5"/>
    ${dots}
  </svg>`;
}

// "Leave" is an excused absence — excluded from the % entirely (neither
// numerator nor denominator), unlike a plain Absent which counts against it.
function attendancePct(records) {
  if (!records || !records.length) return null;
  const countable = records.filter((r) => r.status !== "leave");
  if (!countable.length) return null;
  const present = countable.filter((r) => r.status === "present").length;
  return { pct: Math.round((100 * present) / countable.length), total: countable.length };
}

async function loadStudentReport(studentId) {
  const [{ data: student, error: studentErr }, { data: marks, error: markErr }, { data: attendance }, { data: quizAttempts }] = await Promise.all([
    supabase.from("students").select("*").eq("id", studentId).single(),
    supabase
      .from("marks")
      .select("marks, feedback, marked_at, assignments(title, type, max_marks, due_date)")
      .eq("student_id", studentId),
    supabase.from("attendance").select("status").eq("student_id", studentId),
    supabase.from("quiz_attempts").select("*").eq("student_id", studentId).order("completed_at", { ascending: false }),
  ]);

  if (studentErr || markErr) return { studentId, error: (studentErr || markErr).message };

  const items = (marks || [])
    .map((m) => ({
      title: m.assignments.title,
      type: m.assignments.type,
      dueDate: m.assignments.due_date,
      marksVal: m.marks,
      maxMarks: m.assignments.max_marks,
      pct: Math.round((100 * m.marks) / m.assignments.max_marks),
      feedback: m.feedback,
    }))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return { student, items, attendance: attendancePct(attendance), quizAttempts: quizAttempts || [] };
}

function renderQuizAttempts(attempts) {
  const list = $("srQuizList");
  const empty = $("srQuizEmpty");
  if (!list) return;

  empty.hidden = attempts.length > 0;
  list.innerHTML = attempts.map((a, idx) => {
    const pct = Math.round((100 * a.score) / a.total);
    return `
    <div class="quiz-attempt-item">
      <button type="button" class="quiz-attempt-toggle" data-quiz-toggle="${idx}">
        <span class="quiz-attempt-title">${esc(a.quiz_title)}</span>
        <span class="quiz-attempt-meta">${esc(a.subject)} · ${fmtDateTime(a.completed_at)}</span>
        <span class="quiz-attempt-score">${a.score}/${a.total} (${pct}%)</span>
      </button>
      <div class="quiz-attempt-detail" id="quizDetail${idx}" hidden>
        ${(a.answers || []).map((q) => `
          <div class="quiz-answer-row ${q.correct ? "right" : "wrong"}">
            <div class="quiz-answer-top">
              <span class="quiz-answer-topic">${esc(q.topic || "")}</span>
              <span class="quiz-answer-badge">${q.correct ? "✓ Correct" : "✗ Incorrect"}</span>
            </div>
            <p class="quiz-answer-q">${esc(q.question)}</p>
            ${q.question_type === "mcq"
              ? `<p class="quiz-answer-detail">Picked: <strong>${esc(q.picked)}</strong>${q.correct ? "" : ` · Correct: <strong>${esc(q.correctOption)}</strong>`}</p>`
              : `<p class="quiz-answer-detail">Typed answer: ${q.typedAnswer ? `"${esc(q.typedAnswer)}"` : "<em>(left blank)</em>"}</p>`
            }
          </div>`).join("")}
      </div>
    </div>`;
  }).join("");
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-quiz-toggle]");
  if (!btn) return;
  const detail = document.getElementById(`quizDetail${btn.dataset.quizToggle}`);
  if (detail) detail.hidden = !detail.hidden;
});

function render(report) {
  const { student, items, error, attendance, quizAttempts } = report;

  if (error || !student) {
    $("srAvatar").textContent = "?";
    $("srName").textContent = "Couldn't load student";
    $("srEmail").textContent = "";
    reportStudentId = null;
    $("srCourses").innerHTML = "";
    $("srLatestPct").textContent = "—";
    $("srLatestTrend").textContent = "";
    $("srBand").textContent = "—";
    $("srAvgPct").textContent = "—";
    $("srAvgSub").textContent = "";
    $("srAttendancePct").textContent = "—";
    $("srAttendanceSub").textContent = "";
    $("srChart").innerHTML = "";
    $("srChartEmpty").hidden = false;
    $("srChartEmpty").textContent = `Couldn't load this student: ${error || "not found"}`;
    $("srWorkList").innerHTML = "";
    $("srWorkEmpty").hidden = false;
    $("srWorkEmpty").textContent = "Couldn't load.";
    $("srQuizList").innerHTML = "";
    $("srQuizEmpty").hidden = false;
    $("srQuizEmpty").textContent = "Couldn't load.";
    return;
  }

  renderQuizAttempts(quizAttempts || []);

  $("srAvatar").textContent = student.initials;
  $("srName").textContent = student.name;
  $("srEmail").textContent = student.email;
  reportStudentId = student.id;
  renderCoursePicker(student.subjects);

  $("srAttendancePct").textContent = attendance ? `${attendance.pct}%` : "—";
  $("srAttendanceSub").textContent = attendance
    ? `across ${attendance.total} class${attendance.total === 1 ? "" : "es"}`
    : "No classes marked yet";

  if (!items.length) {
    $("srLatestPct").textContent = "—";
    $("srLatestTrend").textContent = "";
    $("srBand").textContent = "—";
    $("srAvgPct").textContent = "—";
    $("srAvgSub").textContent = "No graded work yet";
    $("srChart").innerHTML = "";
    $("srChartEmpty").hidden = false;
    $("srChartEmpty").textContent = "No graded work yet — the chart appears once you mark something for this student.";
    $("srWorkList").innerHTML = "";
    $("srWorkEmpty").hidden = false;
    $("srWorkEmpty").textContent = "Nothing marked yet for this student.";
    return;
  }

  const latest = items[items.length - 1];
  const prev = items.length >= 2 ? items[items.length - 2] : null;
  const avgPct = equalThirdsAvg(items);
  const band = letterGrade(latest.pct);

  $("srLatestPct").textContent = `${latest.pct}%`;
  if (prev) {
    const delta = latest.pct - prev.pct;
    $("srLatestTrend").textContent = `${delta >= 0 ? "+" : ""}${delta}% from previous`;
    $("srLatestTrend").classList.toggle("up", delta > 0);
  } else {
    $("srLatestTrend").textContent = "First graded item";
    $("srLatestTrend").classList.remove("up");
  }
  $("srBand").textContent = band.label;
  $("srAvgPct").textContent = `${avgPct}%`;
  $("srAvgSub").textContent = `across ${items.length} submission${items.length === 1 ? "" : "s"}`;

  $("srChartEmpty").hidden = true;
  $("srChart").innerHTML = buildChart(items);

  $("srWorkEmpty").hidden = items.length > 0;
  $("srWorkList").innerHTML = items.slice().reverse().map((it) => {
    const g = letterGrade(it.pct);
    const aboveAvg = it.pct >= avgPct;
    return `
    <div class="report-work-item">
      <div class="report-work-top">
        <strong>${esc(it.title)}</strong>
        <span class="report-work-trend ${aboveAvg ? "up" : ""}">${aboveAvg ? "↑ above avg" : "↓ below avg"}</span>
        <span class="report-work-score">${it.marksVal}/${it.maxMarks}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${it.pct}%; background:${zoneColorFor(it.pct)}"></div>
      </div>
      <div class="report-work-bottom">
        <span class="grade-chip ${g.cls}">${g.label}</span>
        <span class="report-work-pct">${it.pct}%</span>
        <span class="report-work-date">${fmtDate(it.dueDate)}</span>
      </div>
      ${it.feedback ? `<p class="report-work-feedback">"${esc(it.feedback)}"</p>` : ""}
    </div>`;
  }).join("");
}

let currentReport = null;

export async function openStudentReport(studentId) {
  const report = await loadStudentReport(studentId);
  currentReport = report;
  render(report);
  location.hash = "#student-report";
  $("viewTitle").textContent = report.student ? report.student.name : "Student Report";
}

window.addEventListener("hashchange", () => {
  if (location.hash === "#student-report" && currentReport && currentReport.student) {
    $("viewTitle").textContent = currentReport.student.name;
  }
});

// Landing directly on this hash (a refresh, browser back/forward, a
// bookmark) with no student actually selected yet would otherwise show a
// permanently blank page — nothing has ever called openStudentReport() to
// fetch and render anything. Bounce back to the roster instead, where
// clicking a name re-enters normally.
if (location.hash === "#student-report" && !currentReport) {
  location.hash = "#students";
}
