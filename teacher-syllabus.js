/* Syllabus Confidence (teacher.html) — how confident the whole class says it
   is on every topic, weakest first, so it's obvious what to re-teach. Reads
   the ratings students make on My Syllabus (syllabus_confidence, see
   supabase/migrations/syllabus-confidence.sql); the teacher's RLS policy
   already lets her read every student's row.

   Chapters are fetched here rather than through loadChapters(): that one
   assigns the shared CHAPTERS array other modules are mid-render on.
   Runs as a module, chained off window.dataReadyPromise like the others. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const view = document.querySelector('[data-view="syllabus"]');
const PAGE = 1000;
const MIN_RATED_TO_FLAG = 3;

let students = [];
let chapters = [];
let rows = [];
let loadError = "";
let subject = null;
let sortWeakest = true;
let seq = 0;
let loadedFor = null;

const viewVisible = () => !view.hidden;

async function fetchAllRatings() {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("syllabus_confidence")
      .select("student_id, chapter_id, level, chapters!inner(cohort_id)")
      .eq("chapters.cohort_id", activeCohort)
      .order("student_id")
      .order("chapter_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

async function load() {
  const mine = ++seq;
  const cohort = activeCohort;
  $("sylArea").innerHTML = '<p class="empty-note">Loading…</p>';
  try {
    const [stu, ch, rated] = await Promise.all([
      supabase.from("students").select("id, subjects").eq("cohort_id", cohort),
      supabase.from("chapters").select("id, subject, parent_id, title, sort_order").eq("cohort_id", cohort).order("sort_order", { ascending: true }),
      fetchAllRatings(),
    ]);
    if (stu.error) throw stu.error;
    if (ch.error) throw ch.error;
    if (mine !== seq) return;
    students = stu.data;
    chapters = ch.data;
    rows = rated;
    loadError = "";
    loadedFor = cohort;
  } catch (err) {
    if (mine !== seq) return;
    loadError = err.message || "unknown error";
  }
  render();
}

function leaves(subjectId) {
  const tops = chapters.filter((c) => c.subject === subjectId && !c.parent_id);
  const out = [];
  tops.forEach((t) => {
    const subs = chapters.filter((c) => c.parent_id === t.id);
    if (subs.length) subs.forEach((s) => out.push({ ...s, group: t.title }));
    else out.push({ ...t, group: "" });
  });
  return out;
}

function stats(item) {
  const enrolled = new Set(students.filter((s) => (s.subjects || []).includes(item.subject)).map((s) => s.id));
  const mine = rows.filter((r) => r.chapter_id === item.id && enrolled.has(r.student_id));
  const confident = mine.filter((r) => r.level === 2).length;
  const shaky = mine.filter((r) => r.level === 1).length;
  const total = enrolled.size;
  return { total, confident, shaky, rated: mine.length, notStarted: Math.max(0, total - confident - shaky), pct: total ? Math.round((100 * confident) / total) : 0 };
}

function rowHTML(item, s) {
  const w = (n) => (s.total ? (100 * n) / s.total : 0);
  const flag = s.rated >= MIN_RATED_TO_FLAG && s.pct < 40;
  const title = escapeHTML(item.title);
  return `
  <div class="syl-trow ${flag ? "flag" : ""}">
    <div class="syl-tmain">
      <b>${title}</b>
      ${item.group ? `<span class="syl-tgroup">${escapeHTML(item.group)}</span>` : ""}
    </div>
    <div class="syl-tbar" role="img" aria-label="${s.confident} confident, ${s.shaky} shaky, ${s.notStarted} not started, out of ${s.total} students">
      <i class="g" style="width:${w(s.confident)}%"></i><i class="a" style="width:${w(s.shaky)}%"></i><i class="r" style="width:${w(s.notStarted)}%"></i>
    </div>
    <div class="syl-tnum">
      ${s.rated ? `<b>${s.pct}%</b> confident` : '<span class="syl-none">No ratings yet</span>'}
      ${flag ? '<span class="syl-reteach">Re-teach</span>' : ""}
    </div>
  </div>`;
}

const escapeHTML = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function render() {
  const el = $("sylArea");
  $("sylHint").textContent = `${COHORT_NAME()} · ${students.length} student${students.length === 1 ? "" : "s"}`;
  if (loadError) {
    el.innerHTML = `<p class="empty-note">Couldn't load syllabus ratings: ${escapeHTML(loadError)}</p>`;
    return;
  }
  const subjects = SUBJECTS.filter((s) => chapters.some((c) => c.subject === s.id));
  if (!subjects.length) {
    el.innerHTML = '<p class="empty-note">No topics for this cohort yet. Add them in Manage Content.</p>';
    return;
  }
  if (!subject || !subjects.some((s) => s.id === subject)) subject = subjects[0].id;

  const items = leaves(subject).map((item) => ({ item, s: stats(item) }));
  const ratedStudents = new Set(rows.filter((r) => items.some((x) => x.item.id === r.chapter_id)).map((r) => r.student_id)).size;
  const withRatings = items.filter((x) => x.s.rated);
  const overall = withRatings.length ? Math.round(withRatings.reduce((a, x) => a + x.s.pct, 0) / withRatings.length) : null;

  const ordered = sortWeakest
    ? [...items].sort((a, b) => (b.s.rated > 0) - (a.s.rated > 0) || a.s.pct - b.s.pct)
    : items;

  const tabs = subjects.length > 1
    ? `<div class="course-tabs" role="tablist" aria-label="Subject">${subjects.map((s) => `<button type="button" class="course-tab ${s.id === subject ? "active" : ""}" role="tab" aria-selected="${s.id === subject}" data-syl-subject="${s.id}">${escapeHTML(s.name)}</button>`).join("")}</div>`
    : "";

  el.innerHTML = `
    ${tabs}
    <div class="syl-tsummary">
      <div><b>${overall === null ? "–" : overall + "%"}</b><span>average confidence</span></div>
      <div><b>${ratedStudents}</b><span>of ${students.length} students have rated topics</span></div>
      <div class="syl-tlegend"><span class="syl-dot g"></span>Confident <span class="syl-dot a"></span>Shaky <span class="syl-dot r"></span>Not started</div>
      <button type="button" class="syl-chip" id="sylSort" aria-pressed="${sortWeakest}">${sortWeakest ? "Weakest first" : "Syllabus order"}</button>
    </div>
    <div class="syl-tlist">${ordered.map((x) => rowHTML(x.item, x.s)).join("")}</div>`;
}

function COHORT_NAME() {
  return COHORT_DATA[activeCohort] ? COHORT_DATA[activeCohort].name : "";
}

view.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-syl-subject]");
  if (tab) { subject = tab.dataset.sylSubject; render(); return; }
  if (e.target.closest("#sylSort")) { sortWeakest = !sortWeakest; render(); }
});

document.addEventListener("swr-view", (e) => {
  if (e.detail === "syllabus") load();
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    subject = null;
    if (viewVisible()) load();
  })
);

window.dataReadyPromise.then(() => {
  if (viewVisible() && loadedFor !== activeCohort) load();
});
