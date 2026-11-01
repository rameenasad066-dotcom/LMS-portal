/* My Syllabus (student.html) — every topic and sub-topic in the student's
   enrolled subjects as a checklist they rate themselves on: not started /
   shaky / confident. Each row links straight to that topic's notes and
   lectures. Ratings live in syllabus_confidence (supabase/migrations/
   syllabus-confidence.sql); a topic with no row counts as not started.

   The checklist items are the existing chapters, so there is nothing extra
   to author: a "leaf" is a sub-topic, or a top-level topic that has no
   sub-topics (a top-level topic with sub-topics is just a heading).
   Exported rather than self-running because it needs CHAPTERS, NOTES and
   LECTURES; auth-guard.js calls initSyllabus() once they have loaded. */

import { supabase } from "./supabase-config.js";

const LEVELS = [
  { v: 0, name: "Not started", cls: "r" },
  { v: 1, name: "Shaky", cls: "a" },
  { v: 2, name: "Confident", cls: "g" },
];

let levels = new Map();
let loadError = "";
let subject = null;
let filter = "all";
let wired = false;
let loaded = false;

const area = () => document.getElementById("syllabusArea");

const escapeHTML = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const levelOf = (id) => levels.get(id) ?? 0;

function leavesFor(subjectId) {
  const tops = CHAPTERS.filter((c) => c.subject === subjectId && !c.parentId);
  const out = [];
  tops.forEach((t) => {
    const subs = CHAPTERS.filter((c) => c.parentId === t.id);
    if (subs.length) subs.forEach((s) => out.push({ ...s, group: t.title }));
    else out.push({ ...t, group: "" });
  });
  return out;
}

const countFor = (arr, id) => arr.filter((x) => x.chapter === id).length;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function rowHTML(item) {
  const lvl = levelOf(item.id);
  const notes = countFor(NOTES, item.id);
  const lectures = countFor(LECTURES, item.id);
  const links = [
    notes ? `<button type="button" class="syl-link" data-syl-open="notes" data-id="${item.id}">${plural(notes, "note")}</button>` : "",
    lectures ? `<button type="button" class="syl-link" data-syl-open="vault" data-id="${item.id}">${plural(lectures, "lecture")}</button>` : "",
  ].join("");
  return `
  <div class="syl-row" data-row="${item.id}">
    <div class="syl-main">
      <b>${escapeHTML(item.title)}</b>
      <span class="syl-links">${links || '<span class="syl-none">Nothing uploaded yet</span>'}</span>
    </div>
    <div class="syl-rag" role="group" aria-label="How confident are you with ${escapeHTML(item.title)}?">
      ${LEVELS.map((l) => `<button type="button" class="syl-rate ${l.cls}" data-syl-id="${item.id}" data-syl-level="${l.v}" aria-pressed="${lvl === l.v}"><span class="syl-dot ${l.cls}" aria-hidden="true"></span><span>${l.name}</span></button>`).join("")}
    </div>
  </div>`;
}

function render() {
  const el = area();
  if (!el || !loaded) return;
  if (loadError) {
    el.innerHTML = `<p class="empty-note">Couldn't load your syllabus: ${escapeHTML(loadError)}</p>`;
    return;
  }
  const subjects = enrolledSubjects();
  if (!subject || !subjects.some((s) => s.id === subject)) subject = subjects[0] ? subjects[0].id : null;
  const items = subject ? leavesFor(subject) : [];
  if (!items.length) {
    el.innerHTML = '<p class="empty-note">Miss Rameen is still setting up the topics for your syllabus. Check back soon.</p>';
    return;
  }

  const counts = [0, 0, 0];
  items.forEach((i) => counts[levelOf(i.id)]++);
  const pc = Math.round((100 * counts[2]) / items.length);
  const shown = filter === "all" ? items : items.filter((i) => levelOf(i.id) === filter);

  let last = null;
  const list = shown.map((i) => {
    const head = i.group !== last ? `<div class="syl-group">${escapeHTML(i.group || "Topics")}</div>` : "";
    last = i.group;
    return head + rowHTML(i);
  }).join("");

  const revise = [...items.filter((i) => levelOf(i.id) === 1), ...items.filter((i) => levelOf(i.id) === 0)].slice(0, 3);

  const tabs = subjects.length > 1
    ? `<div class="course-tabs" role="tablist" aria-label="Subject">${subjects.map((s) => `<button type="button" class="course-tab ${s.id === subject ? "active" : ""}" role="tab" aria-selected="${s.id === subject}" data-syl-subject="${s.id}">${escapeHTML(s.name)}</button>`).join("")}</div>`
    : "";

  const chips = [["all", "All", items.length], [0, "Not started", counts[0]], [1, "Shaky", counts[1]], [2, "Confident", counts[2]]]
    .map(([k, n, c]) => `<button type="button" class="syl-chip ${filter === k ? "on" : ""}" data-syl-filter="${k}" aria-pressed="${filter === k}">${n} <b>${c}</b></button>`).join("");

  el.innerHTML = `
    ${tabs}
    <div class="syl-grid">
      <div>
        <div class="syl-chips">${chips}</div>
        <div class="syl-list">${list || '<p class="empty-note">Nothing here.</p>'}</div>
      </div>
      <aside class="syl-side">
        <div class="syl-card">
          <h3>Your progress</h3>
          <div class="syl-prog">
            <div class="syl-ring" style="--p:${pc}" role="img" aria-label="${pc} percent of topics confident"><span>${pc}%</span></div>
            <ul>
              <li><span class="syl-dot g" aria-hidden="true"></span>Confident <b>${counts[2]}</b></li>
              <li><span class="syl-dot a" aria-hidden="true"></span>Shaky <b>${counts[1]}</b></li>
              <li><span class="syl-dot r" aria-hidden="true"></span>Not started <b>${counts[0]}</b></li>
            </ul>
          </div>
        </div>
        <div class="syl-card syl-next">
          <h3>Revise next</h3>
          ${revise.length
            ? `<ul>${revise.map((i) => `<li>${escapeHTML(i.title)}</li>`).join("")}</ul>`
            : "<p>Everything here is marked confident. Keep it sharp with a past paper.</p>"}
        </div>
      </aside>
    </div>`;
}

async function save(id, level) {
  if (STUDENT.isPreview) {
    showToast("Preview mode", "You're viewing as a student — ratings aren't saved.");
    return;
  }
  const before = levels.get(id);
  levels.set(id, level);
  render();
  const { error } = await supabase
    .from("syllabus_confidence")
    .upsert({ student_id: STUDENT.id, chapter_id: id, level, updated_at: new Date().toISOString() }, { onConflict: "student_id,chapter_id" });
  if (error) {
    if (before === undefined) levels.delete(id); else levels.set(id, before);
    render();
    showToast("Couldn't save", "Check your connection and try again.");
  }
}

function wire() {
  if (wired) return;
  wired = true;
  area().addEventListener("click", (e) => {
    const rate = e.target.closest("[data-syl-id]");
    if (rate) { save(rate.dataset.sylId, Number(rate.dataset.sylLevel)); return; }
    const sub = e.target.closest("[data-syl-subject]");
    if (sub) { subject = sub.dataset.sylSubject; filter = "all"; render(); return; }
    const f = e.target.closest("[data-syl-filter]");
    if (f) { filter = f.dataset.sylFilter === "all" ? "all" : Number(f.dataset.sylFilter); render(); return; }
    const open = e.target.closest("[data-syl-open]");
    if (open) window.openInLibrary(open.dataset.sylOpen, open.dataset.id);
  });
}

export async function initSyllabus() {
  if (!area()) return;
  wire();
  const { data, error } = await supabase
    .from("syllabus_confidence")
    .select("chapter_id, level")
    .eq("student_id", STUDENT.id);
  if (error) loadError = error.message;
  else levels = new Map(data.map((r) => [r.chapter_id, r.level]));
  loaded = true;
  render();
}

// SUBJECTS comes from data/content.json, which can land after this module's
// own fetch finishes; student.js's renderAll() calls this once it has.
window.renderSyllabus = render;
