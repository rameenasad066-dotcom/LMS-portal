/* Per-student report page (Students view → click a student), progress
   system Phase 3. Teacher-only — students keep their simpler My Grades
   page. Unlike get_scoreboard(), this reads `marks`/`assignments` directly
   rather than through a SECURITY DEFINER function, because the "never
   expose raw marks" rule only protects student-from-student visibility;
   the teacher's own RLS policies already grant her full read access to
   every student's marks, so no privacy boundary needs crossing here. */

import { supabase, COURSES, subjectsForCourses, coursesForSubjects, courseLabel } from "./supabase-config.js";
import { byChronology, trendFromPrevious, equalThirdsAvg, attendanceSummary } from "./progress-utils.js";

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
  // Enrolment decides which attendance sessions count, so recompute.
  if (currentReport && currentReport.student && currentReport.student.id === reportStudentId) {
    currentReport.student.subjects = subjectsForCourses(chosen);
    currentReport.attendance = attendanceSummary(currentReport.attendanceRows, chosen);
    render(currentReport);
  }
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

async function loadStudentReport(studentId) {
  const [{ data: student, error: studentErr }, { data: marks, error: markErr }, { data: attendance }] = await Promise.all([
    supabase.from("students").select("*").eq("id", studentId).single(),
    supabase
      .from("marks")
      .select("marks, feedback, marked_at, assignments(title, type, max_marks, due_date, subjects)")
      .eq("student_id", studentId),
    supabase.from("attendance").select("status, class_date, subject").eq("student_id", studentId),
  ]);

  if (studentErr || markErr) return { studentId, error: (studentErr || markErr).message };

  const items = (marks || [])
    .map((m) => ({
      title: m.assignments.title,
      type: m.assignments.type,
      dueDate: m.assignments.due_date,
      markedAt: m.marked_at,
      marksVal: m.marks,
      maxMarks: m.assignments.max_marks,
      pct: Math.round((100 * m.marks) / m.assignments.max_marks),
      feedback: m.feedback,
      subjects: m.assignments.subjects,
    }))
    .sort(byChronology);

  const attendanceRows = attendance || [];
  return {
    student,
    items,
    attendance: attendanceSummary(attendanceRows, coursesForSubjects(student.subjects)),
    attendanceRows,
  };
}

function render(report) {
  const { student, items, error, attendance } = report;
  renderMonthlyPanel(error || !student ? null : report);

  if (error || !student) {
    $("srAvatar").textContent = "?";
    $("srName").textContent = "Couldn't load student";
    $("srEmail").textContent = "";
    reportStudentId = null;
    $("srCourses").innerHTML = "";
    $("srLatestPct").textContent = "—";
    $("srLatestTrend").textContent = "";
    $("srLatestTrend").classList.remove("up", "down");
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
    return;
  }

  $("srAvatar").textContent = student.initials;
  $("srName").textContent = student.name;
  $("srEmail").textContent = student.email;
  reportStudentId = student.id;
  renderCoursePicker(student.subjects);

  $("srAttendancePct").textContent = attendance.pct !== null ? `${attendance.pct}%` : "—";
  $("srAttendanceSub").textContent = attendance.counted
    ? `${attendance.present} of ${attendance.counted} class${attendance.counted === 1 ? "" : "es"} attended`
    : "No classes marked yet";

  if (!items.length) {
    $("srLatestPct").textContent = "—";
    $("srLatestTrend").textContent = "";
    $("srLatestTrend").classList.remove("up", "down");
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
  const trend = trendFromPrevious(items);
  // All-time equal-thirds average (the Scoreboard's own is month-scoped).
  const avgPct = equalThirdsAvg(items);
  const band = letterGrade(latest.pct);

  $("srLatestPct").textContent = `${latest.pct}%`;
  $("srLatestTrend").textContent = trend ? `${trend.deltaText} · ${trend.label}` : "First graded item";
  $("srLatestTrend").classList.toggle("up", !!trend && trend.dir === "up");
  $("srLatestTrend").classList.toggle("down", !!trend && trend.dir === "down");
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

/* ---------- Monthly PDF report ----------
   One calendar month of a student's graded work + attendance, downloaded as
   a PDF via html2pdf.js (CDN, teacher.html). Work belongs to the month it
   was DUE in, matching byChronology and the scoreboard detail card. The PDF
   is built from fixed light colours, not theme tokens, so exporting while
   the portal is in dark mode still produces a normal white report. */

const MR_TYPE_LABEL = { homework: "Homework", assignment: "Assignment", test: "Test" };
const MR_TREND = { up: "Improving", same: "Stable", down: "Needs Attention" };
const PDF = { red: "#C8202C", green: "#3C9A44", gray: "#6B7280", line: "#E5E7EB", ink: "#1A1A1A" };

let monthlyStudentId = null;

function monthKeyOf(isoDate) {
  return isoDate.slice(0, 7);
}

function shiftMonth(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  return new Date(key + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function dayLabel(isoDate) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// An assignment's `subjects` is its audience, not one subject — a Pak
// Studies item carries both history + geography — so the finest honest
// grouping is by course, with all-student work (incl. weekly tests) apart.
function courseGroupOf(subjects) {
  const courses = coursesForSubjects(subjects);
  if (courses.length === COURSES.length) return "All subjects";
  if (!courses.length) return "Other";
  return COURSES.find((c) => c.id === courses[0]).name;
}

function monthlyData(report, key) {
  const items = report.items.filter((it) => monthKeyOf(it.dueDate) === key);
  // Only sessions for courses this student takes count (attendanceSummary).
  const { present, leave, counted } = attendanceSummary(
    report.attendanceRows.filter((r) => r.class_date && monthKeyOf(r.class_date) === key),
    coursesForSubjects(report.student.subjects)
  );

  const avg = equalThirdsAvg(items);
  const prevKey = shiftMonth(key, -1);
  const prevAvg = equalThirdsAvg(report.items.filter((it) => monthKeyOf(it.dueDate) === prevKey));

  // Month-on-month when both months have graded work; otherwise fall back
  // to latest-vs-previous within this month. Same ±3 band as everywhere.
  let trend = null;
  let trendBasis = "Needs at least two graded items, or a graded previous month";
  if (avg !== null && prevAvg !== null) {
    trend = trendFromPrevious([{ pct: prevAvg }, { pct: avg }]);
    trendBasis = `Compared with ${monthLabel(prevKey)} (${prevAvg}%)`;
  } else if (items.length >= 2) {
    trend = trendFromPrevious(items);
    trendBasis = "Latest graded item vs the one before it, this month";
  }

  const groupOrder = [...COURSES.map((c) => c.name), "All subjects", "Other"];
  const groups = groupOrder
    .map((name) => ({ name, items: items.filter((it) => courseGroupOf(it.subjects) === name) }))
    .filter((g) => g.items.length);

  return { key, items, groups, present, leave, counted, avg, trend, trendBasis };
}

function renderMonthlyPanel(report) {
  const sel = $("mrMonth");
  const form = $("mrForm");
  const studentId = report ? report.student.id : null;
  if (studentId !== monthlyStudentId) $("mrRemarks").value = "";
  monthlyStudentId = studentId;

  if (!report) {
    sel.innerHTML = "";
    $("mrSummary").textContent = "";
    form.querySelectorAll("select, textarea, button").forEach((el) => { el.disabled = true; });
    return;
  }
  form.querySelectorAll("select, textarea, button").forEach((el) => { el.disabled = false; });

  // The last complete month is the one a report is usually wanted for.
  const defaultKey = shiftMonth(currentMonthKey(), -1);
  const keys = new Set([currentMonthKey(), defaultKey]);
  report.items.forEach((it) => keys.add(monthKeyOf(it.dueDate)));
  report.attendanceRows.forEach((r) => { if (r.class_date) keys.add(monthKeyOf(r.class_date)); });

  const previous = sel.value;
  sel.innerHTML = [...keys].sort().reverse()
    .map((k) => `<option value="${k}">${monthLabel(k)}</option>`).join("");
  sel.value = keys.has(previous) ? previous : defaultKey;
  renderMonthlySummary();
}

function renderMonthlySummary() {
  if (!currentReport || !currentReport.student) return;
  const d = monthlyData(currentReport, $("mrMonth").value);
  const parts = [
    `${d.items.length} graded item${d.items.length === 1 ? "" : "s"}`,
    d.counted ? `${d.present} of ${d.counted} classes attended` : "no classes marked",
  ];
  if (d.avg !== null) parts.push(`average ${d.avg}%`);
  $("mrSummary").textContent = !d.items.length && !d.counted && !d.leave
    ? `Nothing graded and no attendance marked in ${monthLabel(d.key)} — the report would be empty.`
    : `${monthLabel(d.key)}: ${parts.join(" · ")}.`;
}

function buildPdfChart(items) {
  const W = 680, H = 190, padL = 40, padR = 24, padT = 24, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  // Points sit inset from the axes so the first value label can't collide
  // with the y-axis labels.
  const inset = 28;
  const y = (pct) => padT + plotH * (1 - Math.min(Math.max(pct, 0), 100) / 100);
  const x = (i) => items.length === 1 ? padL + plotW / 2 : padL + inset + ((plotW - 2 * inset) * i) / (items.length - 1);
  const zone = (from, to, color) =>
    `<rect x="${padL}" y="${y(to)}" width="${plotW}" height="${y(from) - y(to)}" fill="${color}" fill-opacity="0.08"/>`;
  const zoneColor = (pct) => (pct >= 80 ? PDF.green : pct >= 50 ? PDF.gray : PDF.red);
  const every = Math.ceil(items.length / 10);

  const grid = [0, 50, 80, 100].map((v) => `
    <line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="${PDF.line}" stroke-width="1"/>
    <text x="${padL - 8}" y="${y(v) + 4}" font-size="10" fill="${PDF.gray}" text-anchor="end">${v}%</text>`).join("");
  const points = items.map((it, i) => ({ cx: x(i), cy: y(it.pct), it, i }));
  const line = points.length > 1
    ? `<polyline points="${points.map((p) => `${p.cx},${p.cy}`).join(" ")}" fill="none" stroke="${PDF.red}" stroke-width="2.5"/>`
    : "";
  const marks = points.map((p) => `
    <circle cx="${p.cx}" cy="${p.cy}" r="5" fill="${zoneColor(p.it.pct)}" stroke="#ffffff" stroke-width="2"/>
    <text x="${p.cx}" y="${p.cy - 10}" font-size="10" font-weight="700" fill="${PDF.ink}" text-anchor="middle">${p.it.pct}%</text>
    ${p.i % every === 0 ? `<text x="${p.cx}" y="${H - padB + 18}" font-size="10" fill="${PDF.gray}" text-anchor="middle">${esc(dayLabel(p.it.dueDate))}</text>` : ""}`).join("");

  return `
  <svg class="mr-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, Arial, sans-serif">
    ${zone(80, 100, PDF.green)}${zone(50, 80, PDF.gray)}${zone(0, 50, PDF.red)}
    ${grid}${line}${marks}
  </svg>`;
}

function buildPdfHTML(report, d, remarks) {
  const { student } = report;
  const [y, m] = d.key.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const teacherName = (document.querySelector(".user-chip-name") || {}).textContent || "Rameen Asad";
  const avgBand = d.avg !== null ? letterGrade(d.avg) : null;
  const attPct = d.counted ? Math.round((100 * d.present) / d.counted) : null;

  const tables = d.groups.map((g) => `
    <h4 class="mr-group">${esc(g.name)}</h4>
    <table class="mr-table">
      <colgroup><col style="width:40%"><col style="width:14%"><col style="width:14%"><col style="width:16%"><col style="width:16%"></colgroup>
      <thead><tr><th>Test name</th><th>Date</th><th>Marks</th><th>Percentage</th><th>Grade</th></tr></thead>
      <tbody>${g.items.map((it) => {
        const band = letterGrade(it.pct);
        return `<tr>
          <td><strong>${esc(it.title)}</strong><span class="mr-type">${esc(MR_TYPE_LABEL[it.type] || it.type)}</span></td>
          <td>${esc(dayLabel(it.dueDate))}</td>
          <td>${it.marksVal} / ${it.maxMarks}</td>
          <td>${it.pct}%</td>
          <td><span class="mr-band ${band.cls}">${band.label}</span></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`).join("");

  return `
  <div class="mr-pdf">
    <header class="mr-head">
      <img src="logo.png" class="mr-logo" alt="">
      <div class="mr-brand"><strong>Study With Rameen</strong><span>Monthly Progress Report</span></div>
      <div class="mr-period">${esc(monthLabel(d.key))}</div>
    </header>

    <section class="mr-id mr-avoid">
      <div><span>Student</span><strong>${esc(student.name)}</strong></div>
      <div><span>Cohort</span><strong>${esc(student.cohort_name || "—")}</strong></div>
      <div><span>Courses</span><strong>${esc(courseLabel(student.subjects))}</strong></div>
      <div><span>Period</span><strong>1–${lastDay} ${esc(monthLabel(d.key))}</strong></div>
    </section>

    <section class="mr-cards mr-avoid">
      <div class="mr-card">
        <span class="mr-card-label">Classes attended</span>
        <strong class="mr-card-value">${d.counted ? `${d.present} / ${d.counted}` : "—"}</strong>
        <span class="mr-card-sub">${attPct !== null ? `${attPct}% attendance` : "No classes marked this month"}${d.leave ? ` · ${d.leave} on leave (excused, not counted)` : ""}</span>
      </div>
      <div class="mr-card">
        <span class="mr-card-label">Monthly average</span>
        <strong class="mr-card-value">${d.avg !== null ? `${d.avg}%` : "—"}</strong>
        <span class="mr-card-sub">${avgBand ? `Grade ${avgBand.label} · homework, assignments and tests weighted equally` : "No graded work this month"}</span>
      </div>
      <div class="mr-card">
        <span class="mr-card-label">Trend</span>
        <strong class="mr-card-value mr-trend-${d.trend ? d.trend.dir : "none"}">${d.trend ? MR_TREND[d.trend.dir] : "—"}</strong>
        <span class="mr-card-sub">${esc(d.trendBasis)}</span>
      </div>
    </section>

    <section class="mr-section mr-avoid">
      <h3>Progress this month</h3>
      ${d.items.length ? buildPdfChart(d.items) : '<p class="mr-empty">No graded work this month.</p>'}
    </section>

    <section class="mr-section">
      <h3>Graded work</h3>
      ${tables || '<p class="mr-empty">No graded work this month.</p>'}
    </section>

    <section class="mr-section mr-avoid">
      <h3>Teacher's remarks</h3>
      <div class="mr-remarks">${remarks ? esc(remarks) : "—"}</div>
      <p class="mr-sign">${esc(teacherName)}</p>
      <footer class="mr-foot">Generated ${esc(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))} · Study With Rameen · O Level &amp; IGCSE Pakistan Studies and Islamiyat</footer>
    </section>
  </div>`;
}

// html2pdf's renderer (html2canvas) draws inline SVG unreliably — the chart
// came out as a squashed sliver — so swap each chart for a PNG first.
async function rasterizeCharts(root) {
  await Promise.all([...root.querySelectorAll("svg.mr-chart")].map(async (svg) => {
    const w = Number(svg.getAttribute("width"));
    const h = Number(svg.getAttribute("height"));
    const src = new Image();
    src.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    await src.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.drawImage(src, 0, 0, w, h);
    const png = new Image();
    png.className = "mr-chart-img";
    png.alt = "Progress chart";
    png.src = canvas.toDataURL("image/png");
    await png.decode();
    svg.replaceWith(png);
  }));
}

async function exportMonthlyPdf() {
  if (!currentReport || !currentReport.student) return;
  if (typeof html2pdf === "undefined") {
    showToast("PDF tool didn't load", "Check your internet connection, then refresh the page.");
    return;
  }

  const d = monthlyData(currentReport, $("mrMonth").value);
  const btn = $("mrExport");
  btn.disabled = true;
  btn.textContent = "Preparing PDF…";

  const host = document.createElement("div");
  host.className = "mr-pdf-host";
  host.innerHTML = buildPdfHTML(currentReport, d, $("mrRemarks").value.trim());
  document.body.append(host);

  const safeName = currentReport.student.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  try {
    await rasterizeCharts(host);
    await html2pdf()
      .set({
        margin: [10, 10, 12, 10],
        filename: `Study-With-Rameen_${safeName}_${d.key}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: [".mr-avoid", "tr", ".mr-group"] },
      })
      .from(host.firstElementChild)
      .save();
    showToast("Report downloaded", `${currentReport.student.name} · ${monthLabel(d.key)}`);
  } catch (err) {
    showToast("Couldn't create the PDF", err.message || "Please try again.");
  } finally {
    host.remove();
    btn.disabled = false;
    btn.textContent = "Export Monthly PDF Report";
  }
}

$("mrMonth").addEventListener("change", renderMonthlySummary);
$("mrForm").addEventListener("submit", (e) => {
  e.preventDefault();
  exportMonthlyPdf();
});

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
