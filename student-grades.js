/* Real "My Grades" page (student.html) — Phase 2 of the progress system.
   Replaces the old hardcoded GRADES array. Pulls from the same
   marks/submissions/assignments tables Phase 1 built: graded rows come
   from `marks`, still-pending rows from `submissions` that don't have a
   matching mark yet, merged into one chronological tracker. Exported
   rather than self-running — auth-guard.js calls it once the profile has
   resolved (this page doesn't strictly need cohortId, but keeping it in
   the same post-auth render sequence as everything else is simplest).

   Split by course (2026-10-07): course tabs switch the stat cards, chart,
   attendance and table between Pakistan Studies and Islamiyat, from one
   fetch. Work posted before the courses were separated counts for both
   (tagged "Both courses"), matching the scoreboard. */

import { supabase, COURSES, coursesForSubjects, coursesForItem } from "./supabase-config.js";
import { byChronology, trendFromPrevious, attendanceSummary } from "./progress-utils.js";

function letterGrade(pct) {
  if (pct >= 90) return { label: "A*", cls: "" };
  if (pct >= 80) return { label: "A", cls: "" };
  if (pct >= 70) return { label: "B", cls: "mid" };
  if (pct >= 60) return { label: "C", cls: "mid" };
  if (pct >= 50) return { label: "D", cls: "mid" };
  return { label: "U", cls: "risk" };
}

function zoneColorFor(pct) {
  if (pct >= 80) return "var(--green)";
  if (pct >= 50) return "var(--gray)";
  return "var(--red)";
}

function fmtDue(isoDate) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Same hand-rolled SVG line chart as teacher-student-report.js — kept as a
// per-page duplicate rather than a shared import since teacher.html and
// student.html are separate apps with no shared module loader.
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

let gradeData = null;
let gradeCourse = null;

export async function renderStudentGrades() {
  const body = document.getElementById("gradeTableBody");
  if (!body) return;

  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const uid = STUDENT.id;
  if (!uid) return;

  const [{ data: marks, error: markErr }, { data: subs }, { data: attendance, error: attErr }] = await Promise.all([
    supabase.from("marks").select("*, assignments(title, type, due_date, max_marks, subjects)").eq("student_id", uid),
    // Assignment embedded so pending rows need no second round trip.
    supabase.from("submissions").select("assignment_id, submitted_at, assignments(title, due_date, subjects)").eq("student_id", uid),
    supabase.from("attendance").select("status, subject").eq("student_id", uid),
  ]);

  if (markErr) {
    gradeData = null;
    document.querySelectorAll("[data-grade-course-tabs]").forEach((b) => { b.hidden = true; });
    set("sGradeLatest", "—");
    set("sGradeLatestSub", "Couldn't load grades");
    body.innerHTML = `<tr><td colspan="5">Couldn't load your grades right now.</td></tr>`;
    return;
  }

  const markedAssignmentIds = new Set((marks || []).map((m) => m.assignment_id));
  const pendingSubs = (subs || []).filter((s) => !markedAssignmentIds.has(s.assignment_id));

  // A mark whose assignment this student can no longer read (moved cohort,
  // or a course removed since it was graded) comes back with a null embed —
  // skip it rather than throw, which used to lock the whole portal.
  const gradedRows = (marks || []).filter((m) => m.assignments).map((m) => ({
    title: m.assignments.title,
    dueDate: m.assignments.due_date,
    markedAt: m.marked_at,
    courses: coursesForItem(m.assignments.subjects),
    status: "graded",
    pct: Math.round((m.marks / m.assignments.max_marks) * 100),
    marksVal: m.marks,
    maxMarks: m.assignments.max_marks,
    feedback: m.feedback,
  }));

  const pendingRows = pendingSubs.map((s) => {
    const a = s.assignments;
    return {
      title: a ? a.title : "Assignment",
      dueDate: a ? a.due_date : s.submitted_at.slice(0, 10),
      markedAt: s.submitted_at,
      courses: a ? coursesForItem(a.subjects) : COURSES.map((c) => c.id),
      status: "pending",
      feedback: null,
    };
  });

  // A tab per course they take, plus any course they still have work tagged
  // to alone (e.g. one they've since dropped), so no grade silently
  // disappears. Untagged pre-split work doesn't count here — it would hand
  // every single-course student a tab for the course they don't take.
  const enrolled = coursesForSubjects(STUDENT.subjects);
  const items = [...gradedRows, ...pendingRows];
  const courses = COURSES.filter((c) =>
    enrolled.includes(c.id) || items.some((it) => it.courses.length === 1 && it.courses[0] === c.id));
  if (!courses.some((c) => c.id === gradeCourse)) {
    const own = courses.find((c) => enrolled.includes(c.id));
    gradeCourse = (own || courses[0] || COURSES[0]).id;
  }

  gradeData = { gradedRows, pendingRows, courses, attendance: attErr ? null : attendance };
  renderGradesForCourse();
}

function renderGradesForCourse() {
  const body = document.getElementById("gradeTableBody");
  if (!body || !gradeData) return;
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const course = gradeCourse;
  const courseName = COURSES.find((c) => c.id === course).name;

  document.querySelectorAll("[data-grade-course-tabs]").forEach((box) => {
    box.hidden = gradeData.courses.length < 2;
    box.innerHTML = gradeData.courses.map((c) => `
      <button type="button" class="course-tab${c.id === course ? " active" : ""}" role="tab"
        aria-selected="${c.id === course}" data-grade-course="${c.id}">${c.name}</button>`).join("");
  });
  set("sGradeCourseName", courseName);

  // Only this course's classes; untagged (pre-split) classes count for both.
  if (!gradeData.attendance) {
    set("sAttendancePct", "—");
    set("sAttendanceSub", "Couldn't load attendance");
  } else {
    const att = attendanceSummary(gradeData.attendance, [course]);
    if (att.counted) {
      set("sAttendancePct", `${att.pct}%`);
      set("sAttendanceSub", `${att.present} of ${att.counted} ${courseName} class${att.counted === 1 ? "" : "es"} attended`);
    } else {
      set("sAttendancePct", "—");
      set("sAttendanceSub", `No ${courseName} classes marked yet`);
    }
  }

  const inCourse = (r) => r.courses.includes(course);
  const gradedRows = gradeData.gradedRows.filter(inCourse);
  const pendingRows = gradeData.pendingRows.filter(inCourse);
  const allRows = [...gradedRows, ...pendingRows].sort((a, b) => byChronology(b, a));
  const chronological = gradedRows.slice().sort(byChronology);

  const latest = chronological[chronological.length - 1];
  set("sGradeLatest", latest ? letterGrade(latest.pct).label : "—");
  set("sGradeLatestSub", latest ? `${latest.title} · due ${fmtDue(latest.dueDate)}` : `No ${courseName} grades yet`);
  set("sGradeTaken", String(allRows.length));
  set("sGradeTakenSub", `${pendingRows.length} pending review`);

  const trendEl = document.getElementById("sGradeTrend");
  const trend = trendFromPrevious(chronological);
  if (trendEl) {
    trendEl.textContent = trend ? trend.label : "—";
    trendEl.classList.toggle("up", !!trend && trend.dir === "up");
    trendEl.classList.toggle("down", !!trend && trend.dir === "down");
  }
  if (trend) {
    set("sGradeTrendSub", `${trend.deltaText} · ${chronological.slice(-4).map((r) => letterGrade(r.pct).label).join(" → ")}`);
  } else {
    set("sGradeTrendSub", chronological.length ? `First graded item · ${letterGrade(chronological[0].pct).label}` : `No ${courseName} grades yet`);
  }

  const chartEl = document.getElementById("sGradeChart");
  const chartEmpty = document.getElementById("sGradeChartEmpty");
  if (chartEl) {
    if (chronological.length) {
      chartEl.innerHTML = buildChart(chronological);
      if (chartEmpty) chartEmpty.hidden = true;
    } else {
      chartEl.innerHTML = "";
      if (chartEmpty) chartEmpty.hidden = false;
    }
  }

  body.innerHTML = allRows.length
    ? allRows.map((r) => {
        const g = r.status === "graded" ? letterGrade(r.pct) : null;
        const both = r.courses.length > 1 ? ' <span class="cat-tag">Both courses</span>' : "";
        return `
      <tr>
        <td data-label="Item"><strong>${esc(r.title)}</strong>${both}</td>
        <td data-label="Due">${esc(fmtDue(r.dueDate))}</td>
        <td data-label="Status"><span class="status-pill ${r.status === "graded" ? "ontime" : "muted"}">${r.status === "graded" ? "Graded" : "Pending review"}</span></td>
        <td data-label="Grade">${g ? `
          <span class="grade-chip ${g.cls}">${g.label}</span> <small>${r.marksVal}/${r.maxMarks} · ${r.pct}%</small>
          <div class="progress-bar"><div class="progress-fill" style="width:${r.pct}%; background:${zoneColorFor(r.pct)}"></div></div>
        ` : "—"}</td>
        <td data-label="Feedback">${r.feedback ? '<button class="btn btn-outline btn-sm fb-toggle">View feedback</button>' : "—"}</td>
      </tr>
      ${r.feedback ? `<tr class="feedback-row" hidden><td colspan="5"><div>"${esc(r.feedback)}"</div></td></tr>` : ""}`;
      }).join("")
    : `<tr><td colspan="5">No ${esc(courseName)} work submitted or marked yet.</td></tr>`;
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-grade-course]");
  if (!tab || tab.dataset.gradeCourse === gradeCourse) return;
  gradeCourse = tab.dataset.gradeCourse;
  renderGradesForCourse();
});
