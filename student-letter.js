/* Sunday Letter (student.html) — the teacher's weekly letter to the cohort.
   The newest letter shows as a blush-pink banner at the top of the dashboard;
   when it's new to this student a small pop-up slides down once (any page).
   Opening it shows the full letter, with earlier letters listed underneath.
   Seen/opened state lives in letter_views (supabase/migrations/
   sunday-letters.sql), so "pops up once" holds across devices and the
   teacher can see who opened it. Preview mode never writes. */

import { supabase } from "./supabase-config.js";

let letters = [];
let views = new Map();
let current = null;
let lastFocus = null;
let wired = false;

const $ = (id) => document.getElementById(id);
const escapeHTML = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const fmtShort = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function paragraphs(text) {
  return text.trim().split(/\n\s*\n/).map((p) => `<p>${escapeHTML(p.trim())}</p>`).join("");
}

function renderBanner() {
  const el = $("letterBanner");
  if (!el) return;
  const l = letters[0];
  el.hidden = !l;
  if (!l) return;
  const unopened = !(views.get(l.id) || {}).opened_at;
  el.innerHTML = `
    <div class="lt-banner">
      <span class="lt-seal" aria-hidden="true">R</span>
      <div class="lt-banner-text">
        <span class="lt-kicker">${unopened ? '<span class="lt-new">New</span>' : ""}Sunday Letter · ${fmtShort(l.created_at)}</span>
        <h2>${escapeHTML(l.title)}</h2>
      </div>
      <button type="button" class="btn btn-primary lt-read" data-letter-open="${l.id}">Read it</button>
    </div>`;
}

function record(letterId, opened) {
  if (STUDENT.isPreview || !STUDENT.id) return;
  const prev = views.get(letterId) || {};
  if (opened) {
    if (prev.opened_at) return;
    const now = new Date().toISOString();
    views.set(letterId, { ...prev, opened_at: now });
    supabase.from("letter_views").upsert({ letter_id: letterId, student_id: STUDENT.id, opened_at: now }, { onConflict: "letter_id,student_id" })
      .then(({ error }) => { if (error) console.warn("[letter] couldn't record opened", error.message); });
  } else {
    if (views.has(letterId)) return;
    views.set(letterId, {});
    supabase.from("letter_views").upsert({ letter_id: letterId, student_id: STUDENT.id }, { onConflict: "letter_id,student_id", ignoreDuplicates: true })
      .then(({ error }) => { if (error) console.warn("[letter] couldn't record seen", error.message); });
  }
}

function showPopup() {
  const l = letters[0];
  const pop = $("letterPopup");
  if (!l || !pop || views.has(l.id)) return;
  pop.innerHTML = `
    <span class="lt-seal small" aria-hidden="true">R</span>
    <div class="lt-pop-text"><b>New letter from Miss Rameen</b><span>${escapeHTML(l.title)}</span></div>
    <button type="button" class="btn btn-primary btn-sm" data-letter-open="${l.id}">Read</button>
    <button type="button" class="lt-pop-x" data-letter-dismiss aria-label="Dismiss">×</button>`;
  pop.hidden = false;
  requestAnimationFrame(() => pop.classList.add("show"));
  record(l.id, false);
}

function hidePopup() {
  const pop = $("letterPopup");
  if (!pop) return;
  pop.classList.remove("show");
  setTimeout(() => { pop.hidden = true; }, 300);
}

function openLetter(id) {
  const l = letters.find((x) => x.id === id);
  if (!l) return;
  current = l;
  hidePopup();
  lastFocus = document.activeElement;
  const others = letters.filter((x) => x.id !== id);
  $("letterReader").innerHTML = `
    <article class="lt-paper" role="dialog" aria-modal="true" aria-labelledby="ltTitle">
      <button type="button" class="lt-close" data-letter-close aria-label="Close letter">×</button>
      <div class="lt-meta">Sunday Letter · ${fmtDate(l.created_at)}</div>
      <h2 id="ltTitle">${escapeHTML(l.title)}</h2>
      <div class="lt-body">${paragraphs(l.body)}</div>
      <div class="lt-sign">Miss Rameen</div>
      ${others.length ? `<div class="lt-earlier"><h3>Earlier letters</h3>${others.map((o) => `<button type="button" class="lt-earlier-row" data-letter-open="${o.id}"><span>${escapeHTML(o.title)}</span><small>${fmtShort(o.created_at)}</small></button>`).join("")}</div>` : ""}
    </article>`;
  $("letterReader").hidden = false;
  document.body.classList.add("lt-lock");
  $("letterReader").querySelector(".lt-close").focus();
  $("letterReader").scrollTop = 0;
  record(l.id, true);
  renderBanner();
}

function closeLetter() {
  $("letterReader").hidden = true;
  document.body.classList.remove("lt-lock");
  current = null;
  // The banner re-renders when a letter is opened, so the button that opened
  // it may be gone; fall back to the banner's own Read button.
  const back = lastFocus && document.contains(lastFocus) ? lastFocus : document.querySelector("#letterBanner .lt-read");
  if (back) back.focus();
}

function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-letter-open]");
    if (open) { openLetter(open.dataset.letterOpen); return; }
    if (e.target.closest("[data-letter-dismiss]")) { hidePopup(); return; }
    if (e.target.closest("[data-letter-close]") || e.target.id === "letterReader") closeLetter();
  });
  document.addEventListener("keydown", (e) => {
    if (!current) return;
    if (e.key === "Escape") { closeLetter(); return; }
    if (e.key === "Tab") {
      const f = [...$("letterReader").querySelectorAll("button")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
}

export async function initLetters() {
  wire();
  if (!STUDENT.cohortId) return;
  const [{ data, error }, v] = await Promise.all([
    supabase.from("sunday_letters").select("id, title, body, created_at")
      .eq("cohort_id", STUDENT.cohortId).order("created_at", { ascending: false }).limit(20),
    supabase.from("letter_views").select("letter_id, seen_at, opened_at").eq("student_id", STUDENT.id),
  ]);
  if (error) { console.warn("[letter] couldn't load letters", error.message); return; }
  letters = data || [];
  views = new Map((v.data || []).map((r) => [r.letter_id, r]));
  renderBanner();
  showPopup();
}
