/* Real scoreboard (teacher.html) — Phase 2 of the progress system. Calls
   the get_scoreboard() Postgres function (SECURITY DEFINER — computes ranks
   server-side so raw marks never need to be exposed to the client at all,
   teacher included). Runs as a module — see teacher-auth-guard.js for the
   script-order reasoning.

   Month picker (2026-09-04) — get_scoreboard() used to be hard-locked to
   the current calendar month. get_scoreboard_months() supplies the
   dropdown's options, scoped to whichever cohort pill is active.

   Bar-leaderboard redesign (2026-09-04, same day) — replaces the old
   top-3 podium + separate ranked list with a single reference-matched
   design (see supabase/migrations/scoreboard-bar-redesign.sql): every
   ranked student in one row list, bar width driven by `score` (an
   aggregate rollup — never a raw mark, never printed as a number),
   ▲/▼/– driven by `prevRank` (that student's rank the prior calendar
   month). A row click opens an inline detail card with that student's
   real per-assessment marks (for the month being viewed) and their
   all-time attendance % — fetched fresh on click, not derived from the
   row's rollup score. This teacher page is the only place rows are
   clickable at all; nothing here needs a client-side role check because
   a student never has a session that can load this file in the first
   place, and the marks/attendance queries below ride the teacher's
   existing "can view all students" RLS policies — a tampered request
   from an actual student session would just get zero rows back, same
   protection teacher-student-report.js already relies on. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

let selectedMonth = null; // null = current month
let currentRows = [];
let openId = null;
const detailCache = new Map(); // keyed `${studentId}:${monthIso}`

function currentMonthIso() {
  return new Date().toISOString().slice(0, 8) + "01";
}

function monthLabel(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function populateMonthSelect() {
  const sel = $("scoreboardMonth");
  if (!sel) return;

  const { data, error } = await supabase.rpc("get_scoreboard_months", { target_cohort: activeCohort });
  const months = error || !data ? [] : data.map((r) => r.month_start);
  const current = currentMonthIso();
  if (!months.includes(current)) months.unshift(current);

  const prevValue = sel.value;
  sel.innerHTML = months
    .map((m) => `<option value="${m}">${m === current ? "This month" : monthLabel(m)}</option>`)
    .join("");
  sel.value = months.includes(prevValue) ? prevValue : current;
  selectedMonth = sel.value === current ? null : sel.value;
}

// "Leave" is an excused absence, excluded from the % entirely — same rule
// as everywhere else attendance is shown (teacher-student-report.js, etc).
function attendancePct(records) {
  if (!records || !records.length) return null;
  const countable = records.filter((r) => r.status !== "leave");
  if (!countable.length) return null;
  const present = countable.filter((r) => r.status === "present").length;
  return Math.round((100 * present) / countable.length);
}

async function loadDetail(studentId, monthIso) {
  const key = `${studentId}:${monthIso}`;
  if (detailCache.has(key)) return detailCache.get(key);

  const monthStart = new Date(monthIso + "T00:00:00");
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const [{ data: marks }, { data: attendance }] = await Promise.all([
    supabase
      .from("marks")
      .select("marks, assignments(title, type, max_marks, due_date)")
      .eq("student_id", studentId),
    supabase.from("attendance").select("status").eq("student_id", studentId),
  ]);

  const items = (marks || [])
    .filter((m) => {
      const due = new Date(m.assignments.due_date + "T00:00:00");
      return due >= monthStart && due < monthEnd;
    })
    .map((m) => ({ title: m.assignments.title, marks: m.marks, maxMarks: m.assignments.max_marks }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const detail = { items, attendance: attendancePct(attendance) };
  detailCache.set(key, detail);
  return detail;
}

function rowHTML(entry, maxScore) {
  const isTop = entry.rank === 1;
  const isPodium = entry.rank <= 3;
  const dir = entry.prevRank == null ? "same" : entry.prevRank > entry.rank ? "up" : entry.prevRank < entry.rank ? "down" : "same";
  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";
  const barPct = maxScore > 0 ? Math.round((entry.score / maxScore) * 100) : 0;

  return `
    <div class="sb-row clickable" data-student-row="${entry.id}">
      <div class="sb-rank-badge${isTop ? " top" : ""}">${entry.rank}</div>
      <div class="sb-avatar${isTop ? " top" : isPodium ? " podium" : ""}">${esc(entry.initials)}</div>
      <div class="sb-name">${esc(entry.name)}</div>
      <div class="sb-bar-track"><div class="sb-bar-fill${isTop ? " top" : ""}" style="width:${barPct}%"></div></div>
      <div class="sb-delta ${dir}">${glyph}</div>
    </div>
    <div class="sb-detail" id="sbDetail-${entry.id}"></div>`;
}

function detailInnerHTML(name, detail) {
  const itemsHTML = detail.items.length
    ? detail.items.map((it) => `
      <div class="sb-detail-line">
        <span class="sb-detail-muted">${esc(it.title)}</span>
        <span><strong>${it.marks}</strong>/${it.maxMarks}</span>
      </div>`).join("")
    : `<div class="sb-detail-line sb-detail-muted">Nothing marked for ${esc(name)} this month.</div>`;

  return `
    <div class="sb-detail-title">${esc(name)}</div>
    ${itemsHTML}
    <div class="sb-detail-line" style="margin-top:4px">
      <span class="sb-detail-muted">Attendance</span>
      <span><strong>${detail.attendance == null ? "—" : detail.attendance + "%"}</strong></span>
    </div>`;
}

async function toggleDetail(studentId) {
  const wasOpen = openId === studentId;
  if (openId) {
    const prevEl = $(`sbDetail-${openId}`);
    if (prevEl) prevEl.classList.remove("open");
  }
  openId = wasOpen ? null : studentId;
  if (!openId) return;

  const el = $(`sbDetail-${studentId}`);
  if (!el) return;
  const entry = currentRows.find((r) => r.id === studentId);
  const monthIso = selectedMonth || currentMonthIso();
  el.innerHTML = `<div class="sb-detail-line sb-detail-muted">Loading…</div>`;
  el.classList.add("open");

  try {
    const detail = await loadDetail(studentId, monthIso);
    if (openId !== studentId) return; // a different row was opened while this was loading
    el.innerHTML = detailInnerHTML(entry ? entry.name : "", detail);
  } catch (err) {
    if (openId !== studentId) return;
    el.innerHTML = `<div class="sb-detail-line sb-detail-muted">Couldn't load: ${esc(err.message || "please try again")}</div>`;
  }
}

async function renderScoreboardReal() {
  await populateMonthSelect();
  openId = null;
  detailCache.clear();

  const { data, error } = await supabase.rpc("get_scoreboard", {
    target_cohort: activeCohort,
    target_month: selectedMonth,
  });

  currentRows = (!error && data && data.fullList) || [];
  const has = currentRows.length > 0;
  const isCurrent = !selectedMonth;

  $("sbRows").hidden = !has;
  $("podiumEmpty").hidden = has;
  $("scoreboardHint").textContent = has
    ? `${monthLabel(selectedMonth || currentMonthIso())} · computed live from marks`
    : "";

  if (error) {
    $("podiumEmpty").hidden = false;
    $("podiumEmpty").textContent = `Couldn't load the scoreboard: ${error.message}`;
    $("sbRows").innerHTML = "";
    return;
  }
  if (!has) {
    $("podiumEmpty").textContent = isCurrent
      ? "No marks entered yet this month — the scoreboard fills in as you grade work."
      : "No marks were entered that month.";
    $("sbRows").innerHTML = "";
    return;
  }

  const maxScore = Math.max(...currentRows.map((r) => r.score));
  $("sbRows").innerHTML = currentRows.map((entry) => rowHTML(entry, maxScore)).join("");
}

$("sbRows").addEventListener("click", (e) => {
  const row = e.target.closest("[data-student-row]");
  if (!row) return;
  toggleDetail(row.dataset.studentRow);
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderScoreboardReal)
);

$("scoreboardMonth").addEventListener("change", renderScoreboardReal);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "scoreboard") renderScoreboardReal();
});

window.dataReadyPromise.then(renderScoreboardReal);
