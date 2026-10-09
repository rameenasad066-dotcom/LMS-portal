/* AI Practice (teacher.html) — what the active cohort is practising, how
   they're scoring, and where they're weak. Reads student_attempts (written by
   the grade-answer Edge Function, read-only here) and the question bank, then
   aggregates in the browser: a cohort is a few dozen students, so one fetch of
   the latest attempts is simpler and snappier than a server aggregate.

   Four tabs share one set of filters (section / topic / student / period):
   Recent attempts, By student, By question, By topic. A new attempt arriving
   through Realtime refreshes the page, so it stays current while she watches.
   Runs as a module — see teacher-auth-guard.js for the script-order reasoning. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

const ATTEMPT_LIMIT = 1500;
const PAGE_SIZE = 50;
const MIN_FOR_WEAK = 2;
const STALE_MS = 15000;

let questions = [];
let students = [];
let attempts = [];
let lastFetch = 0;
let fetchSeq = 0;
let tab = "recent";
let shown = PAGE_SIZE;
let showUntried = false;
let channel = null;
let refreshTimer = null;

const filters = { section: "", topic: "", student: "", period: "all" };

const view = document.querySelector('section.view[data-view="practice"]');
const viewVisible = () => !view.hidden;
const topicOf = (q) => (q && q.topic) || "General";
const qMap = () => new Map(questions.map((q) => [q.id, q]));

/* ------------------------------------------------------------- helpers */

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fullWhen(iso) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const pct = (marks, max) => (max ? Math.round((marks / max) * 100) : 0);
const bandOf = (p) => (p >= 75 ? "high" : p >= 50 ? "mid" : "low");

function markChip(marks, max) {
  return `<span class="pr-mark" data-band="${bandOf(pct(marks, max))}">${marks}/${max}</span>`;
}

function paperLabel(q) {
  if (!q) return "";
  return `${q.session === "Oct/Nov" ? "Oct/Nov" : "May/June"} ${q.year} · ${q.question_ref}`;
}

function group(list, keyFn) {
  const m = new Map();
  for (const x of list) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

function summary(list) {
  const marks = list.reduce((n, a) => n + a.marks_awarded, 0);
  const max = list.reduce((n, a) => n + a.max_marks, 0);
  return {
    count: list.length,
    students: new Set(list.map((a) => a.student_id)).size,
    avgPct: max ? Math.round((marks / max) * 100) : null,
    avgMark: list.length ? marks / list.length : null,
    avgMax: list.length ? max / list.length : null,
    last: list.reduce((t, a) => (a.created_at > t ? a.created_at : t), ""),
  };
}

const periodCutoff = () => (filters.period === "all" ? null : new Date(Date.now() - Number(filters.period) * 86400000).toISOString());

function filteredAttempts({ ignoreStudent = false } = {}) {
  const q = qMap();
  const cutoff = periodCutoff();
  return attempts.filter((a) => {
    const question = q.get(a.question_id);
    if (filters.section && String(question?.section) !== filters.section) return false;
    if (filters.topic && topicOf(question) !== filters.topic) return false;
    if (!ignoreStudent && filters.student && a.student_id !== filters.student) return false;
    if (cutoff && a.created_at < cutoff) return false;
    return true;
  });
}

function filteredQuestions() {
  return questions.filter((q) =>
    (!filters.section || String(q.section) === filters.section) &&
    (!filters.topic || topicOf(q) === filters.topic));
}

/* ----------------------------------------------------------- filter UI */

function fillFilters() {
  const sections = [...new Set(questions.map((q) => q.section))].sort();
  $("prSection").innerHTML = `<option value="">All sections</option>${sections.map((s) => `<option value="${s}">Section ${s}</option>`).join("")}`;
  $("prSection").value = filters.section;

  const pool = questions.filter((q) => !filters.section || String(q.section) === filters.section);
  const topics = [...new Set(pool.map(topicOf))].sort((a, b) => a.localeCompare(b));
  if (filters.topic && !topics.includes(filters.topic)) filters.topic = "";
  $("prTopic").innerHTML = `<option value="">All topics</option>${topics.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}`;
  $("prTopic").value = filters.topic;

  const withAttempts = new Set(attempts.map((a) => a.student_id));
  const roster = students.filter((s) => (s.subjects || []).includes("history") || withAttempts.has(s.id));
  if (filters.student && !roster.some((s) => s.id === filters.student)) filters.student = "";
  $("prStudent").innerHTML = `<option value="">All students</option>${roster.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}`;
  $("prStudent").value = filters.student;
  $("prPeriod").value = filters.period;
}

/* --------------------------------------------------------------- stats */

function weakestTopic(list) {
  const q = qMap();
  const byTopic = [...group(list, (a) => topicOf(q.get(a.question_id))).entries()].map(([topic, rows]) => ({ topic, ...summary(rows) }));
  const solid = byTopic.filter((t) => t.count >= MIN_FOR_WEAK);
  const pool = solid.length ? solid : byTopic;
  return pool.sort((a, b) => a.avgPct - b.avgPct || b.count - a.count)[0] || null;
}

function renderStats(list) {
  const s = summary(list);
  const week = list.filter((a) => a.created_at >= new Date(Date.now() - 7 * 86400000).toISOString()).length;
  const historyStudents = students.filter((x) => (x.subjects || []).includes("history")).length;
  const weak = weakestTopic(list);

  $("prStatAttempts").textContent = String(s.count);
  $("prStatAttemptsSub").textContent = s.count ? `${week} in the last 7 days` : "Nothing practised yet";
  $("prStatStudents").textContent = String(s.students);
  $("prStatStudentsSub").textContent = `of ${historyStudents} History student${historyStudents === 1 ? "" : "s"}`;
  $("prStatAvg").textContent = s.avgPct == null ? "—" : `${s.avgPct}%`;
  $("prStatAvgSub").textContent = s.count ? `Average ${s.avgMark.toFixed(1)} / ${Math.round(s.avgMax)} marks` : "No marks yet";
  $("prStatWeak").textContent = weak ? weak.topic : "—";
  $("prStatWeak").title = weak ? weak.topic : "";
  $("prStatWeakSub").textContent = weak ? `${weak.avgPct}% avg · ${weak.count} attempt${weak.count === 1 ? "" : "s"}` : "Needs a few attempts";
}

/* ---------------------------------------------------------------- tabs */

function avatar(name, initials) {
  return `<span class="student-cell"><span class="avatar-initials sm">${esc(initials || "")}</span>${esc(name)}</span>`;
}

function emptyMsg(text) {
  return `<p class="empty-note">${esc(text)}</p>`;
}

function recentTab(list) {
  if (!attempts.length) return emptyMsg("Nobody has practised yet. Attempts appear here as students submit answers.");
  if (!list.length) return emptyMsg("No practice attempts match these filters.");
  const q = qMap();
  const rows = list.slice(0, shown).map((a) => {
    const question = q.get(a.question_id);
    return `
      <tr>
        <td data-label="When" title="${esc(fullWhen(a.created_at))}">${esc(ago(a.created_at))}</td>
        <td data-label="Student">${avatar(a.students?.name || "Student", a.students?.initials)}</td>
        <td data-label="Topic"><span class="pr-topic-cell">${esc(topicOf(question))}</span><small class="pr-sub">Section ${question ? question.section : "?"}</small></td>
        <td data-label="Question"><span class="pr-q-clamp" title="${esc(question?.question || "")}">${esc(question?.question || "(removed question)")}</span><small class="pr-sub">${esc(paperLabel(question))}</small></td>
        <td data-label="Mark">${markChip(a.marks_awarded, a.max_marks)}</td>
        <td><button type="button" class="btn btn-outline btn-sm" data-pr-view="${a.id}">View</button></td>
      </tr>`;
  }).join("");
  const more = list.length > shown
    ? `<div class="pr-more"><button type="button" class="btn btn-outline btn-sm" data-pr-more>Show ${Math.min(PAGE_SIZE, list.length - shown)} more</button> <span class="date-hint">Showing ${shown} of ${list.length}</span></div>`
    : "";
  return `
    <div class="table-wrap">
      <table class="sub-table pr-table">
        <thead><tr><th scope="col">When</th><th scope="col">Student</th><th scope="col">Topic</th><th scope="col">Question</th><th scope="col">Mark</th><th scope="col"></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>${more}`;
}

function studentsTab(list) {
  const byStudent = group(list, (a) => a.student_id);
  const withAttempts = new Set(attempts.map((a) => a.student_id));
  const roster = students.filter((s) => (s.subjects || []).includes("history") || withAttempts.has(s.id));
  const rows = roster.map((s) => {
    const mine = byStudent.get(s.id) || [];
    const sm = summary(mine);
    const tried = new Set(mine.map((a) => a.question_id)).size;
    const best = mine.reduce((n, a) => Math.max(n, a.marks_awarded), 0);
    const weak = mine.length ? weakestTopic(mine) : null;
    return { s, mine, sm, tried, best, weak };
  }).sort((a, b) => b.sm.count - a.sm.count || a.s.name.localeCompare(b.s.name));

  if (!rows.length) return emptyMsg("No History students in this cohort yet.");
  const body = rows.map(({ s, mine, sm, tried, best, weak }) => `
      <tr class="${mine.length ? "" : "pr-quiet"}">
        <td data-label="Student">${avatar(s.name, s.initials)}</td>
        <td data-label="Attempts">${sm.count}</td>
        <td data-label="Questions tried">${tried}</td>
        <td data-label="Average">${mine.length ? `${markChip(Math.round(sm.avgMark * 10) / 10, Math.round(sm.avgMax))} <small class="pr-sub">${sm.avgPct}%</small>` : '<span class="pr-none">No practice yet</span>'}</td>
        <td data-label="Best">${mine.length ? `${best}/${mine[0].max_marks}` : "—"}</td>
        <td data-label="Last practised">${sm.last ? esc(ago(sm.last)) : "—"}</td>
        <td data-label="Weakest topic">${weak ? `${esc(weak.topic)} <small class="pr-sub">${weak.avgPct}%</small>` : "—"}</td>
        <td>${mine.length ? `<button type="button" class="btn btn-outline btn-sm" data-pr-student="${s.id}">View attempts</button>` : ""}</td>
      </tr>`).join("");
  return `
    <div class="table-wrap">
      <table class="sub-table pr-table">
        <thead><tr><th scope="col">Student</th><th scope="col">Attempts</th><th scope="col">Questions tried</th><th scope="col">Average</th><th scope="col">Best</th><th scope="col">Last practised</th><th scope="col">Weakest topic</th><th scope="col"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function questionsTab(list) {
  const byQ = group(list, (a) => a.question_id);
  const all = filteredQuestions().map((q) => ({ q, rows: byQ.get(q.id) || [] }));
  const practised = all.filter((x) => x.rows.length);
  const items = (showUntried ? all : practised)
    .sort((a, b) => b.rows.length - a.rows.length || a.q.id - b.q.id);

  const toggle = `
    <label class="pr-toggle">
      <input type="checkbox" data-pr-untried ${showUntried ? "checked" : ""}>
      <span>Include questions nobody has tried</span>
    </label>
    <span class="res-count">${practised.length} of ${all.length} questions practised</span>`;
  if (!items.length) return `<div class="pr-q-head">${toggle}</div>${emptyMsg("No questions have been practised with these filters.")}`;

  const body = items.map(({ q, rows }) => {
    const sm = summary(rows);
    return `
      <tr class="${rows.length ? "" : "pr-quiet"}">
        <td data-label="Question"><span class="pr-q-clamp" title="${esc(q.question)}">${esc(q.question)}</span><small class="pr-sub">${esc(paperLabel(q))}</small></td>
        <td data-label="Topic"><span class="pr-topic-cell">${esc(topicOf(q))}</span><small class="pr-sub">Section ${q.section}</small></td>
        <td data-label="Attempts">${sm.count}</td>
        <td data-label="Students">${sm.students}</td>
        <td data-label="Average">${rows.length ? `${markChip(Math.round(sm.avgMark * 10) / 10, Math.round(sm.avgMax))}` : "—"}</td>
        <td data-label="Last practised">${sm.last ? esc(ago(sm.last)) : "—"}</td>
      </tr>`;
  }).join("");
  return `
    <div class="pr-q-head">${toggle}</div>
    <div class="table-wrap">
      <table class="sub-table pr-table">
        <thead><tr><th scope="col">Question</th><th scope="col">Topic</th><th scope="col">Attempts</th><th scope="col">Students</th><th scope="col">Average</th><th scope="col">Last practised</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function topicsTab(list) {
  const q = qMap();
  const byTopic = group(list, (a) => topicOf(q.get(a.question_id)));
  const topicQs = group(filteredQuestions(), topicOf);
  const rows = [...topicQs.entries()].map(([topic, qs]) => {
    const mine = byTopic.get(topic) || [];
    return { topic, section: qs[0].section, total: qs.length, tried: new Set(mine.map((a) => a.question_id)).size, ...summary(mine) };
  });
  if (!rows.length) return emptyMsg("No topics to show.");

  const practised = rows.filter((r) => r.count).sort((a, b) => a.avgPct - b.avgPct || b.count - a.count);
  const untouched = rows.filter((r) => !r.count).sort((a, b) => a.section - b.section || a.topic.localeCompare(b.topic));
  const line = (r) => `
      <tr class="${r.count ? "" : "pr-quiet"}">
        <td data-label="Topic"><span class="pr-topic-cell">${esc(r.topic)}</span><small class="pr-sub">Section ${r.section}</small></td>
        <td data-label="Attempts">${r.count}</td>
        <td data-label="Students">${r.students}</td>
        <td data-label="Questions tried">${r.tried} of ${r.total}</td>
        <td data-label="Average">${r.count
          ? `<span class="pr-avg"><span class="pr-bar" role="img" aria-label="${r.avgPct}% average"><i data-band="${bandOf(r.avgPct)}" style="width:${r.avgPct}%"></i></span><strong>${r.avgPct}%</strong></span>`
          : '<span class="pr-none">Not practised yet</span>'}</td>
        <td>${r.count >= MIN_FOR_WEAK && r.avgPct < 50 ? '<span class="status-pill late">Needs revision</span>' : ""}</td>
      </tr>`;
  return `
    <p class="date-hint pr-note">Weakest topics first. "Needs revision" means an average under 50% across at least ${MIN_FOR_WEAK} attempts.</p>
    <div class="table-wrap">
      <table class="sub-table pr-table">
        <thead><tr><th scope="col">Topic</th><th scope="col">Attempts</th><th scope="col">Students</th><th scope="col">Questions tried</th><th scope="col">Average</th><th scope="col"></th></tr></thead>
        <tbody>${practised.map(line).join("")}${untouched.map(line).join("")}</tbody>
      </table>
    </div>`;
}

/* ------------------------------------------------------------- render */

function render() {
  fillFilters();
  const list = filteredAttempts();
  renderStats(list);
  $("prHint").textContent = `${COHORT_DATA[activeCohort].name} · ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} recorded${attempts.length >= ATTEMPT_LIMIT ? ` (latest ${ATTEMPT_LIMIT} shown)` : ""}`;

  document.querySelectorAll("[data-pr-tab]").forEach((b) => {
    const on = b.dataset.prTab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });

  $("prBody").innerHTML =
    tab === "students" ? studentsTab(list)
    : tab === "questions" ? questionsTab(list)
    : tab === "topics" ? topicsTab(list)
    : recentTab(list);
}

function showError(message) {
  $("prBody").innerHTML = `<p class="empty-note">${esc(message)}</p>`;
  ["prStatAttempts", "prStatStudents", "prStatAvg", "prStatWeak"].forEach((id) => { $(id).textContent = "—"; });
}

/* --------------------------------------------------------------- data */

async function refresh() {
  const seq = ++fetchSeq;
  $("prRefresh").classList.add("spinning");
  const needQuestions = !questions.length;

  const [aRes, sRes, qRes] = await Promise.all([
    supabase.from("student_attempts")
      .select("id, student_id, question_id, student_answer, marks_awarded, max_marks, feedback, breakdown, created_at, students!inner(name, initials, cohort_id)")
      .eq("students.cohort_id", activeCohort)
      .order("created_at", { ascending: false })
      .limit(ATTEMPT_LIMIT),
    supabase.from("students").select("id, name, initials, subjects").eq("cohort_id", activeCohort).order("name"),
    needQuestions
      ? supabase.from("questions").select("id, section, topic, question, question_ref, session, year, max_marks").order("id")
      : Promise.resolve(null),
  ]);
  if (seq !== fetchSeq) return;
  $("prRefresh").classList.remove("spinning");

  if (qRes && qRes.error) { showError(`Couldn't load the question bank: ${qRes.error.message}. Has supabase/migrations/ai-practice.sql been run?`); return; }
  if (aRes.error) { showError(`Couldn't load practice activity: ${aRes.error.message}. Has supabase/migrations/ai-practice.sql been run?`); return; }
  if (qRes) questions = qRes.data || [];
  students = sRes.error ? [] : (sRes.data || []);
  attempts = aRes.data || [];
  lastFetch = Date.now();
  render();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (viewVisible()) refresh(); else lastFetch = 0; }, 800);
}

function setLive(on) {
  const el = $("prLive");
  el.dataset.live = on ? "on" : "off";
  el.querySelector("span").textContent = on ? "Live" : "Refresh to update";
}

function subscribe() {
  if (channel) return;
  try {
    channel = supabase
      .channel("practice-attempts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "student_attempts" }, scheduleRefresh)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
  } catch {
    setLive(false);
  }
}

/* ------------------------------------------------------------- detail */

function openDetail(id) {
  const a = attempts.find((x) => x.id === id);
  if (!a) return;
  const q = qMap().get(a.question_id);
  const b = a.breakdown || {};
  const credited = Array.isArray(b.points_credited) ? b.points_credited : [];
  const not = Array.isArray(b.not_credited) ? b.not_credited : [];
  const missed = Array.isArray(b.missed_opportunities) ? b.missed_opportunities : [];

  $("prModalTitle").textContent = `${a.students?.name || "Student"} · ${fullWhen(a.created_at)}`;
  $("prModalBody").innerHTML = `
    <div class="pr-detail-head">
      <div>
        <span class="pr-sub">${esc(topicOf(q))} · Section ${q ? q.section : "?"} · ${esc(paperLabel(q))}</span>
        <strong class="pr-detail-q">${esc(q?.question || "(removed question)")}</strong>
      </div>
      ${markChip(a.marks_awarded, a.max_marks)}
    </div>

    <h4 class="pr-h">Student's answer</h4>
    <p class="pr-answer-text">${esc(a.student_answer)}</p>

    <h4 class="pr-h">Marks earned</h4>
    ${credited.length ? `<ul class="pr-credit-list">${credited.map((p) => `
      <li class="pr-credit"><span class="pr-tick" aria-hidden="true">✓</span><div>
        <strong>${esc(p.point)}</strong>
        <span class="pr-type${p.mark_type === "supporting detail" ? " detail" : ""}">${p.mark_type === "supporting detail" ? "Supporting detail" : "Point"}</span>
        ${p.student_quote ? `<blockquote>“${esc(p.student_quote)}”</blockquote>` : ""}
      </div></li>`).join("")}</ul>` : '<p class="empty-note">No marks were earned.</p>'}

    ${not.length ? `<h4 class="pr-h">Not credited</h4><ul class="pr-not-list">${not.map((n) => `<li><span class="pr-cross" aria-hidden="true">✗</span><div><strong>${esc(n.statement)}</strong><span>${esc(n.reason)}</span></div></li>`).join("")}</ul>` : ""}
    ${missed.length ? `<h4 class="pr-h">Points the student missed</h4><ul class="pr-more-list">${missed.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}

    <h4 class="pr-h">Feedback the student saw</h4>
    <p class="pr-feedback">${esc(a.feedback || "")}</p>
    ${b.borderline_notes ? `<p class="date-hint"><strong>Borderline:</strong> ${esc(b.borderline_notes)}</p>` : ""}`;
  $("prModal").hidden = false;
  $("prModal").querySelector(".modal-close").focus();
}

function closeDetail() {
  $("prModal").hidden = true;
}

/* ------------------------------------------------------------- events */

$("prSection").addEventListener("change", (e) => { filters.section = e.target.value; filters.topic = ""; shown = PAGE_SIZE; render(); });
$("prTopic").addEventListener("change", (e) => { filters.topic = e.target.value; shown = PAGE_SIZE; render(); });
$("prStudent").addEventListener("change", (e) => { filters.student = e.target.value; shown = PAGE_SIZE; render(); });
$("prPeriod").addEventListener("change", (e) => { filters.period = e.target.value; shown = PAGE_SIZE; render(); });
$("prRefresh").addEventListener("click", refresh);

view.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-pr-tab]");
  if (tabBtn) { tab = tabBtn.dataset.prTab; shown = PAGE_SIZE; render(); return; }
  const view = e.target.closest("[data-pr-view]");
  if (view) { openDetail(view.dataset.prView); return; }
  const stu = e.target.closest("[data-pr-student]");
  if (stu) { filters.student = stu.dataset.prStudent; tab = "recent"; shown = PAGE_SIZE; render(); return; }
  if (e.target.closest("[data-pr-more]")) { shown += PAGE_SIZE; render(); }
});

view.addEventListener("change", (e) => {
  if (e.target.matches("[data-pr-untried]")) { showUntried = e.target.checked; render(); }
});

$("prModal").addEventListener("click", (e) => {
  if (e.target === $("prModal") || e.target.closest("[data-modal-close]")) closeDetail();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("prModal").hidden) closeDetail(); });

document.addEventListener("swr-view", (e) => {
  if (e.detail === "practice") { subscribe(); refresh(); }
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    filters.student = "";
    if (viewVisible()) refresh();
  })
);

window.addEventListener("focus", () => {
  if (viewVisible() && Date.now() - lastFetch > STALE_MS) refresh();
});

// Landing straight on #practice (page refresh): the first swr-view fired before
// this module existed, so render once the shared data is ready.
window.dataReadyPromise.then(() => {
  if (viewVisible()) { subscribe(); refresh(); }
});
