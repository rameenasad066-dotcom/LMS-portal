/* Real "My Grades" page (student.html) — Phase 2 of the progress system.
   Replaces the old hardcoded GRADES array. Pulls from the same
   marks/submissions/assignments tables Phase 1 built: graded rows come
   from `marks`, still-pending rows from `submissions` that don't have a
   matching mark yet, merged into one chronological tracker. Exported
   rather than self-running — auth-guard.js calls it once the profile has
   resolved (this page doesn't strictly need cohortId, but keeping it in
   the same post-auth render sequence as everything else is simplest). */

import { supabase } from "./supabase-config.js";
import { byChronology, trendFromPrevious } from "./progress-utils.js";

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

export async function renderStudentGrades() {
  const body = document.getElementById("gradeTableBody");
  if (!body) return;

  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  const uid = STUDENT.id;
  if (!uid) return;

  const [{ data: marks, error: markErr }, { data: subs }, { data: attendance, error: attErr }] = await Promise.all([
    supabase.from("marks").select("*, assignments(title, type, due_date, max_marks)").eq("student_id", uid),
    supabase.from("submissions").select("*").eq("student_id", uid),
    supabase.from("attendance").select("status").eq("student_id", uid),
  ]);

  // "Leave" is an excused absence — excluded from the % entirely, unlike
  // a plain Absent which counts against it.
  const countableAtt = (attendance || []).filter((r) => r.status !== "leave");
  if (attErr) {
    set("sAttendancePct", "—");
    set("sAttendanceSub", "Couldn't load attendance");
  } else if (countableAtt.length) {
    const present = countableAtt.filter((r) => r.status === "present").length;
    set("sAttendancePct", `${Math.round((100 * present) / countableAtt.length)}%`);
    set("sAttendanceSub", `across ${countableAtt.length} class${countableAtt.length === 1 ? "" : "es"}`);
  } else {
    set("sAttendancePct", "—");
    set("sAttendanceSub", "No classes marked yet");
  }

  if (markErr) {
    set("sGradeLatest", "—");
    set("sGradeLatestSub", "Couldn't load grades");
    body.innerHTML = `<tr><td colspan="5">Couldn't load your grades right now.</td></tr>`;
    return;
  }

  const markedAssignmentIds = new Set((marks || []).map((m) => m.assignment_id));
  const pendingSubs = (subs || []).filter((s) => !markedAssignmentIds.has(s.assignment_id));

  let pendingAssignments = [];
  if (pendingSubs.length) {
    const { data } = await supabase.from("assignments").select("*").in("id", pendingSubs.map((s) => s.assignment_id));
    pendingAssignments = data || [];
  }

  // A mark whose assignment this student can no longer read (moved cohort,
  // or a course removed since it was graded) comes back with a null embed —
  // skip it rather than throw, which used to lock the whole portal.
  const gradedRows = (marks || []).filter((m) => m.assignments).map((m) => ({
    title: m.assignments.title,
    dueDate: m.assignments.due_date,
    markedAt: m.marked_at,
    status: "graded",
    pct: Math.round((m.marks / m.assignments.max_marks) * 100),
    marksVal: m.marks,
    maxMarks: m.assignments.max_marks,
    feedback: m.feedback,
  }));

  const pendingRows = pendingSubs.map((s) => {
    const a = pendingAssignments.find((x) => x.id === s.assignment_id);
    return {
      title: a ? a.title : "Assignment",
      dueDate: a ? a.due_date : s.submitted_at.slice(0, 10),
      markedAt: s.submitted_at,
      status: "pending",
      feedback: null,
    };
  });

  const allRows = [...gradedRows, ...pendingRows].sort((a, b) => byChronology(b, a));
  const chronological = gradedRows.slice().sort(byChronology);

  const latest = chronological[chronological.length - 1];
  set("sGradeLatest", latest ? letterGrade(latest.pct).label : "—");
  set("sGradeLatestSub", latest ? `${latest.title} · due ${fmtDue(latest.dueDate)}` : "No grades yet");
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
    set("sGradeTrendSub", chronological.length ? `First graded item · ${letterGrade(chronological[0].pct).label}` : "No grades yet");
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
        return `
      <tr>
        <td data-label="Item"><strong>${esc(r.title)}</strong></td>
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
    : `<tr><td colspan="5">Nothing submitted or marked yet.</td></tr>`;
}
