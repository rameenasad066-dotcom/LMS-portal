/* AI Practice (student.html) — pick a past-paper History 4-mark question,
   write an answer, and have it marked against that question's own mark
   scheme by the grade-answer Edge Function (supabase/functions/grade-answer).
   Flow: Section -> Topic/Question -> Answer -> Result. Each marked attempt is
   saved to student_attempts by the function itself, so the page only ever
   reads attempts, never writes them.

   The questions are fetched with an explicit column list that leaves out
   mark_scheme: students have no grant on that column (ai-practice.sql), so
   the only place a scheme's points appear is the feedback AFTER an attempt.
   Exported rather than self-running because it needs STUDENT.id/subjects —
   auth-guard.js calls initPractice() once the profile has resolved. */

import { supabase, SUPABASE_URL } from "./supabase-config.js";

const Q_COLS = "id, section, topic, session, year, paper_variant, question_ref, question, max_marks";
const A_COLS = "id, question_id, student_answer, marks_awarded, max_marks, feedback, breakdown, created_at";
const MIN_CHARS = 10;
const MAX_CHARS = 3000;

let questions = [];
let attempts = [];
let ready = false;
let loadError = "";
let wired = false;

const state = {
  step: "sections",     // sections | questions | answer | result
  section: null,
  topic: "",
  search: "",
  question: null,
  attempt: null,
  draft: "",
  grading: false,
  error: "",
  remaining: null,
  listIds: [],
};

const area = () => document.getElementById("practiceArea");
const navLink = () => document.querySelector('.snav-item[data-view="practice"]');

/* ------------------------------------------------------------- helpers */

const topicOf = (q) => q.topic || "General";

function paperLabel(q) {
  const session = q.session === "Oct/Nov" ? "Oct/Nov" : "May/June";
  return `${session} ${q.year}${q.paper_variant ? ` (${q.paper_variant})` : ""} · ${q.question_ref}`;
}

function bandOf(marks, max) {
  const p = max ? marks / max : 0;
  return p >= 0.75 ? "high" : p >= 0.5 ? "mid" : "low";
}

function headline(marks, max) {
  if (marks >= max) return "Full marks";
  const p = marks / max;
  if (p >= 0.75) return "Strong answer";
  if (p >= 0.5) return "Getting there";
  if (marks > 0) return "A start";
  return "Not scored this time";
}

function fmtWhen(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function attemptsByQuestion() {
  const map = new Map();
  for (const a of attempts) {
    const cur = map.get(a.question_id) || { best: 0, count: 0, max: a.max_marks };
    cur.count += 1;
    cur.best = Math.max(cur.best, a.marks_awarded);
    cur.max = a.max_marks;
    map.set(a.question_id, cur);
  }
  return map;
}

function questionById(id) {
  return questions.find((q) => q.id === id);
}

function filteredQuestions() {
  const s = state.search.trim().toLowerCase();
  return questions.filter((q) =>
    q.section === state.section &&
    (!state.topic || topicOf(q) === state.topic) &&
    (!s || `${q.question} ${topicOf(q)} ${q.year}`.toLowerCase().includes(s))
  );
}

/* ------------------------------------------------------------ rendering */

function pageHead(title, hint) {
  return `
    <div class="panel-head">
      <h2 tabindex="-1" data-pr-focus>${esc(title)}</h2>
      ${hint ? `<span class="panel-hint">${esc(hint)}</span>` : ""}
    </div>`;
}

function crumbs(parts) {
  return `<nav class="pr-crumbs" aria-label="Where you are">${parts
    .map((p, i) => (p.action
      ? `<button type="button" class="pr-crumb" data-pr="${p.action}">${esc(p.label)}</button>`
      : `<span class="pr-crumb current" ${i === parts.length - 1 ? 'aria-current="page"' : ""}>${esc(p.label)}</span>`))
    .join('<span class="pr-crumb-sep" aria-hidden="true">›</span>')}</nav>`;
}

function markChip(marks, max) {
  return `<span class="pr-mark" data-band="${bandOf(marks, max)}">${marks}/${max}</span>`;
}

function renderSections() {
  const tried = attemptsByQuestion();
  const cards = [1, 2, 3].map((n) => {
    const qs = questions.filter((q) => q.section === n);
    if (!qs.length) return "";
    const topics = new Set(qs.map(topicOf)).size;
    const practised = qs.filter((q) => tried.has(q.id)).length;
    const pct = Math.round((practised / qs.length) * 100);
    return `
      <button type="button" class="pr-section-card" data-pr="open-section" data-section="${n}">
        <span class="pr-section-num">${n}</span>
        <span class="pr-section-body">
          <strong>Section ${n}</strong>
          <span class="pr-section-meta">${topics} topic${topics === 1 ? "" : "s"} · ${qs.length} questions</span>
          <span class="pr-progress" role="img" aria-label="${practised} of ${qs.length} questions practised"><i style="width:${pct}%"></i></span>
          <span class="pr-section-meta">${practised} of ${qs.length} practised</span>
        </span>
      </button>`;
  }).join("");

  const recent = attempts.slice(0, 5).map((a) => {
    const q = questionById(a.question_id);
    return `
      <li>
        <button type="button" class="pr-recent-row" data-pr="open-attempt" data-attempt="${a.id}">
          <span class="pr-recent-q">${esc(q ? q.question : "Question")}</span>
          <span class="pr-recent-when">${fmtWhen(a.created_at)}</span>
          ${markChip(a.marks_awarded, a.max_marks)}
        </button>
      </li>`;
  }).join("");

  return `
    ${pageHead("AI Practice", "Past-paper History 4-mark questions, marked like an examiner")}
    ${STUDENT.isPreview ? '<p class="pr-note">Preview mode: you can look around, but marking is switched off.</p>' : ""}
    <div class="pr-intro">
      <p>Choose a question, write your answer, and get it marked against the real mark scheme. You'll see exactly which points earned a mark, which didn't, and what to add next time.</p>
      <ul class="pr-rules">
        <li><strong>1 mark</strong> for each accurate point that answers the question</li>
        <li><strong>+1 mark</strong> when you add accurate detail to a point you've made</li>
        <li>Restating the question, opinions and vague statements earn nothing</li>
      </ul>
    </div>
    <h3 class="list-title">Pick a section</h3>
    <div class="pr-section-grid">${cards || '<p class="empty-note">No questions are available yet.</p>'}</div>
    ${recent ? `<h3 class="list-title spaced">Your recent attempts</h3><ul class="pr-recent">${recent}</ul>` : ""}`;
}

function renderQuestions() {
  const inSection = questions.filter((q) => q.section === state.section);
  const topics = [...new Set(inSection.map(topicOf))].sort((a, b) => a.localeCompare(b));
  const list = filteredQuestions();
  const tried = attemptsByQuestion();

  const rows = list.map((q) => {
    const t = tried.get(q.id);
    return `
      <li>
        <button type="button" class="pr-q-card" data-pr="open-question" data-qid="${q.id}">
          <span class="pr-q-main">
            <strong class="pr-q-text">${esc(q.question)}</strong>
            <span class="pr-q-meta">${esc(topicOf(q))} · ${esc(paperLabel(q))}</span>
          </span>
          ${t
            ? `<span class="pr-q-status">${markChip(t.best, t.max)}<small>best · ${t.count} ${t.count === 1 ? "try" : "tries"}</small></span>`
            : '<span class="pr-q-status"><span class="pr-new">New</span></span>'}
        </button>
      </li>`;
  }).join("");

  return `
    ${crumbs([{ label: "AI Practice", action: "back-sections" }, { label: `Section ${state.section}` }])}
    ${pageHead(`Section ${state.section}`, `${inSection.length} questions`)}
    <div class="pr-filters">
      <label class="pr-filter">
        <span>Topic</span>
        <select id="prTopic" class="tool-select" data-pr-filter="topic">
          <option value="">All topics (${inSection.length})</option>
          ${topics.map((t) => `<option value="${esc(t)}" ${t === state.topic ? "selected" : ""}>${esc(t)} (${inSection.filter((q) => topicOf(q) === t).length})</option>`).join("")}
        </select>
      </label>
      <label class="pr-filter pr-filter-grow">
        <span>Search</span>
        <input type="search" id="prSearch" class="res-search" value="${esc(state.search)}" placeholder="e.g. Plassey, Nehru Report…" autocomplete="off">
      </label>
    </div>
    <p class="res-count" aria-live="polite">${list.length} question${list.length === 1 ? "" : "s"}</p>
    ${rows ? `<ul class="pr-q-list">${rows}</ul>` : '<p class="empty-note">No questions match. Try a different topic or search.</p>'}`;
}

function renderAnswer() {
  const q = state.question;
  const tried = attemptsByQuestion().get(q.id);
  const len = state.draft.length;
  return `
    ${crumbs([
      { label: "AI Practice", action: "back-sections" },
      { label: `Section ${q.section}`, action: "back-questions" },
      { label: "Answer" },
    ])}
    <div class="pr-question-box">
      <span class="pr-q-meta">${esc(topicOf(q))} · ${esc(paperLabel(q))}</span>
      <h2 class="pr-question" tabindex="-1" data-pr-focus>${esc(q.question)}</h2>
      <span class="pr-marks-tag">[${q.max_marks} marks]</span>
      ${tried ? `<span class="pr-tried">You've tried this ${tried.count} ${tried.count === 1 ? "time" : "times"} · best ${tried.best}/${tried.max}</span>` : ""}
    </div>
    <form class="settings-form pr-answer-form" data-pr-form novalidate>
      <label for="prAnswer">Your answer</label>
      <textarea id="prAnswer" rows="9" maxlength="${MAX_CHARS}" ${state.grading ? "disabled" : ""}
        placeholder="Write 4 clear points. Add a specific fact (a name, date or place) to a point to earn the extra mark.">${esc(state.draft)}</textarea>
      <div class="pr-counter-row">
        <span class="date-hint" id="prHint">Aim for four accurate points; each can earn a second mark with detail.</span>
        <span class="pr-counter" id="prCounter" aria-live="off">${len} / ${MAX_CHARS}</span>
      </div>
      ${state.error ? `<p class="auth-error" role="alert">${esc(state.error)}</p>` : ""}
      ${state.grading ? `
        <div class="pr-grading" role="status" aria-live="polite">
          <span class="pr-spinner" aria-hidden="true"></span>
          <span><strong>Marking your answer…</strong><small>This usually takes 10–20 seconds. Please don't close the page.</small></span>
        </div>` : ""}
      <div class="pr-actions">
        <button type="submit" class="btn btn-primary" id="prSubmit" ${state.grading || len < MIN_CHARS ? "disabled" : ""}>Submit for AI grading</button>
        <button type="button" class="btn btn-outline" data-pr="back-questions" ${state.grading ? "disabled" : ""}>Back to questions</button>
      </div>
    </form>`;
}

function creditList(items) {
  return items.map((p) => `
    <li class="pr-credit">
      <span class="pr-tick" aria-hidden="true">✓</span>
      <div>
        <strong>${esc(p.point)}</strong>
        <span class="pr-type${p.mark_type === "supporting detail" ? " detail" : ""}">${p.mark_type === "supporting detail" ? "Supporting detail" : "Point"}</span>
        ${p.student_quote ? `<blockquote>You wrote: “${esc(p.student_quote)}”</blockquote>` : ""}
      </div>
    </li>`).join("");
}

function renderResult() {
  const a = state.attempt;
  const q = questionById(a.question_id) || state.question;
  const b = a.breakdown || {};
  const credited = Array.isArray(b.points_credited) ? b.points_credited : [];
  const notCredited = Array.isArray(b.not_credited) ? b.not_credited : [];
  const missed = Array.isArray(b.missed_opportunities) ? b.missed_opportunities : [];
  const nextId = state.listIds[state.listIds.indexOf(a.question_id) + 1];

  return `
    ${crumbs([
      { label: "AI Practice", action: "back-sections" },
      ...(q ? [{ label: `Section ${q.section}`, action: "back-questions" }] : []),
      { label: "Result" },
    ])}
    <div class="pr-result-head" data-band="${bandOf(a.marks_awarded, a.max_marks)}">
      <div class="pr-score-ring" aria-label="${a.marks_awarded} out of ${a.max_marks} marks">
        <strong>${a.marks_awarded}</strong><span>out of ${a.max_marks}</span>
      </div>
      <div>
        <h2 tabindex="-1" data-pr-focus>${esc(headline(a.marks_awarded, a.max_marks))}</h2>
        <p class="pr-result-q">${q ? esc(q.question) : ""}</p>
        <span class="date-hint">${fmtWhen(a.created_at)}${state.remaining != null ? ` · ${state.remaining} AI marking${state.remaining === 1 ? "" : "s"} left today` : ""}</span>
      </div>
    </div>

    <section class="pr-block" aria-labelledby="prEarned">
      <h3 id="prEarned">Marks you earned</h3>
      ${credited.length ? `<ul class="pr-credit-list">${creditList(credited)}</ul>` : '<p class="empty-note">No marks were earned on this attempt.</p>'}
    </section>

    ${notCredited.length ? `
    <section class="pr-block" aria-labelledby="prNot">
      <h3 id="prNot">Not credited</h3>
      <ul class="pr-not-list">${notCredited.map((n) => `
        <li><span class="pr-cross" aria-hidden="true">✗</span><div><strong>${esc(n.statement)}</strong><span>${esc(n.reason)}</span></div></li>`).join("")}
      </ul>
    </section>` : ""}

    ${missed.length ? `
    <section class="pr-block" aria-labelledby="prMore">
      <h3 id="prMore">How to score more</h3>
      <ul class="pr-more-list">${missed.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
    </section>` : ""}

    <section class="pr-block" aria-labelledby="prFb">
      <h3 id="prFb">Examiner feedback</h3>
      <p class="pr-feedback">${esc(a.feedback || "")}</p>
      ${b.borderline_notes ? `<p class="date-hint"><strong>Borderline:</strong> ${esc(b.borderline_notes)}</p>` : ""}
    </section>

    <details class="pr-yours">
      <summary>Your answer</summary>
      <p>${esc(a.student_answer || "")}</p>
    </details>

    <div class="pr-actions">
      ${q ? `<button type="button" class="btn btn-primary" data-pr="try-again" data-qid="${q.id}">Try this question again</button>` : ""}
      ${nextId ? `<button type="button" class="btn btn-outline" data-pr="open-question" data-qid="${nextId}">Next question</button>` : ""}
      <button type="button" class="btn btn-outline" data-pr="${q ? "back-questions" : "back-sections"}">${q ? "Back to questions" : "Back to AI Practice"}</button>
    </div>
    <p class="date-hint">Saved to your practice history.</p>`;
}

function render(focus = false) {
  const el = area();
  if (!el) return;

  if (!isEnrolledIn("history")) {
    el.innerHTML = `${pageHead("AI Practice")}<p class="empty-note">AI Practice is for History students.</p>`;
    return;
  }
  if (loadError) {
    el.innerHTML = `${pageHead("AI Practice")}<p class="empty-note">${esc(loadError)}</p>`;
    return;
  }
  if (!ready) {
    el.innerHTML = `${pageHead("AI Practice")}<p class="empty-note">Loading questions…</p>`;
    return;
  }

  el.innerHTML =
    state.step === "questions" ? renderQuestions()
    : state.step === "answer" ? renderAnswer()
    : state.step === "result" ? renderResult()
    : renderSections();

  if (focus) {
    const target = el.querySelector("[data-pr-focus]");
    if (target) target.focus({ preventScroll: false });
  }
}

/* -------------------------------------------------------------- actions */

function go(step, extra = {}) {
  Object.assign(state, { step, error: "" }, extra);
  render(true);
  window.scrollTo({ top: 0 });
}

function openQuestion(id) {
  const q = questionById(id);
  if (!q) return;
  state.section = q.section;
  state.listIds = filteredQuestions().map((x) => x.id);
  if (!state.listIds.includes(q.id)) state.listIds = [q.id];
  go("answer", { question: q, draft: "", attempt: null, grading: false });
}

async function submitAnswer() {
  const answer = state.draft.trim();
  if (state.grading) return;
  if (answer.length < MIN_CHARS) {
    state.error = `Write a little more before submitting (at least ${MIN_CHARS} characters).`;
    render();
    return;
  }
  if (STUDENT.isPreview) {
    showToast("Preview mode", "You're viewing as a student: AI marking is switched off.");
    return;
  }

  state.grading = true;
  state.error = "";
  render();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw Object.assign(new Error("Please sign in again."), { shown: true });
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/grade-answer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: state.question.id, answer }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { shown: true });

    if (!attempts.some((a) => a.id === data.attempt.id)) attempts.unshift(data.attempt);
    state.attempt = data.attempt;
    state.remaining = data.remainingToday ?? null;
    state.grading = false;
    go("result");
  } catch (err) {
    state.grading = false;
    state.error = err && err.shown
      ? err.message
      : "Couldn't reach the AI marker. Check your connection and try again. Your answer is still here.";
    render();
  }
}

function onClick(e) {
  const btn = e.target.closest("[data-pr]");
  if (!btn) return;
  const act = btn.dataset.pr;

  if (act === "open-section") go("questions", { section: Number(btn.dataset.section), topic: "", search: "" });
  else if (act === "back-sections") go("sections");
  else if (act === "back-questions") go("questions");
  else if (act === "open-question" || act === "try-again") openQuestion(Number(btn.dataset.qid));
  else if (act === "open-attempt") {
    const a = attempts.find((x) => x.id === btn.dataset.attempt);
    if (!a) return;
    const q = questionById(a.question_id);
    if (q) { state.section = q.section; state.listIds = []; }
    go("result", { attempt: a, question: q || null, remaining: null });
  }
}

function onInput(e) {
  if (e.target.id === "prAnswer") {
    state.draft = e.target.value;
    const len = state.draft.length;
    const counter = document.getElementById("prCounter");
    if (counter) counter.textContent = `${len} / ${MAX_CHARS}`;
    const submit = document.getElementById("prSubmit");
    if (submit) submit.disabled = state.grading || len < MIN_CHARS;
  } else if (e.target.id === "prSearch") {
    state.search = e.target.value;
    // Re-render the list only, so the search box keeps focus while typing.
    const el = area();
    const caret = e.target.selectionStart;
    el.innerHTML = renderQuestions();
    const box = document.getElementById("prSearch");
    if (box) { box.focus(); box.setSelectionRange(caret, caret); }
  }
}

function onChange(e) {
  if (e.target.matches('[data-pr-filter="topic"]')) {
    state.topic = e.target.value;
    render();
    const sel = document.getElementById("prTopic");
    if (sel) sel.focus();
  }
}

function wire() {
  if (wired) return;
  const el = area();
  if (!el) return;
  wired = true;
  el.addEventListener("click", onClick);
  el.addEventListener("input", onInput);
  el.addEventListener("change", onChange);
  el.addEventListener("submit", (e) => {
    if (!e.target.matches("[data-pr-form]")) return;
    e.preventDefault();
    submitAnswer();
  });
}

/* ----------------------------------------------------------------- init */

export async function initPractice() {
  const link = navLink();
  const enrolled = isEnrolledIn("history");
  if (link) link.hidden = !enrolled;
  wire();
  if (!enrolled) { render(); return; }

  render();
  const [qRes, aRes] = await Promise.all([
    supabase.from("questions").select(Q_COLS).order("section").order("id"),
    supabase.from("student_attempts").select(A_COLS).eq("student_id", STUDENT.id).order("created_at", { ascending: false }).limit(300),
  ]);

  if (qRes.error) {
    loadError = "AI Practice isn't available yet. Please check back soon.";
    console.error("[ai-practice] couldn't load questions:", qRes.error.message);
  } else {
    questions = qRes.data || [];
    attempts = aRes.error ? [] : (aRes.data || []);
    ready = true;
  }
  render();
}
