/* Review (student.html) — a private review of classes: a 1–5 rating, what
   they think, and anything they'd like changed. Only the teacher can read
   reviews (supabase/migrations/class-reviews.sql); the student sees just
   their own past ones underneath the form. Preview mode never sends. */

import { supabase } from "./supabase-config.js";

// Her four faces (img/reviews). Stored on the 1–5 scale so averages still
// read "out of 5"; 2 only exists on reviews sent before these faces.
const FACES = [
  { v: 1, img: "not-good", label: "Not good" },
  { v: 3, img: "figuring-out", label: "Okay, I'm still in the figuring out phase" },
  { v: 4, img: "good", label: "Good" },
  { v: 5, img: "loving-it", label: "Loving it" },
];
const LEGACY = { 2: { v: 2, img: "not-good", label: "Could be better" } };
const faceImg = (f, size) => `<img src="img/reviews/${f.img}.png" alt="" width="${size}" height="${size}">`;

let mine = [];
let rating = 0;
let sending = false;
let loadError = "";
let justSent = false;
let wired = false;

const area = () => document.getElementById("reviewArea");
const escapeHTML = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const faceOf = (v) => FACES.find((f) => f.v === v) || LEGACY[v] || FACES[1];

function formHTML() {
  if (justSent) {
    return `<div class="rv-thanks" role="status">
      <span class="rv-thanks-face" aria-hidden="true">💌</span>
      <div><b>Thank you! Miss Rameen will read it.</b><span>Only she can see your review.</span></div>
      <button type="button" class="btn btn-outline btn-sm" data-rv-again>Write another</button>
    </div>`;
  }
  return `
  <form class="rv-form" id="reviewForm" novalidate>
    <fieldset class="rv-rate">
      <legend>How are your classes going?</legend>
      <div class="rv-faces">
        ${FACES.map((f) => `<button type="button" class="rv-face" data-rv-rate="${f.v}" aria-pressed="${rating === f.v}"><span class="rv-emoji" aria-hidden="true">${faceImg(f, 64)}</span><span>${f.label}</span></button>`).join("")}
      </div>
    </fieldset>
    <label for="rvComment">Your review <span class="rv-opt">optional</span></label>
    <textarea id="rvComment" rows="4" maxlength="2000" placeholder="What's working well? How do you find the classes, notes, tests?"></textarea>
    <label for="rvChange">Anything you'd like changed, or more of? <span class="rv-opt">optional</span></label>
    <textarea id="rvChange" rows="3" maxlength="2000" placeholder="Something you'd like more of, less of, or a problem you've had"></textarea>
    <p class="rv-private"><span aria-hidden="true">🔒</span> Your review stays private, just between you and Miss Rameen.</p>
    <button type="submit" class="btn btn-primary" ${sending ? "disabled" : ""}>${sending ? "Sending…" : "Send review"}</button>
  </form>`;
}

function render() {
  const el = area();
  if (!el) return;
  if (loadError) { el.innerHTML = `<p class="empty-note">Reviews aren't available right now: ${escapeHTML(loadError)}</p>`; return; }
  const past = mine.length
    ? `<div class="rv-past"><h3>Your past reviews</h3>${mine.map((r) => `
        <div class="rv-past-row">
          <span class="rv-past-face" aria-hidden="true">${faceImg(faceOf(r.rating), 36)}</span>
          <div><b>${faceOf(r.rating).label}</b><small>${fmt(r.created_at)}${r.read_at ? " · read by Miss Rameen" : ""}</small>
          ${r.comment ? `<p>${escapeHTML(r.comment)}</p>` : ""}${r.change_request ? `<p><i>Would like:</i> ${escapeHTML(r.change_request)}</p>` : ""}</div>
        </div>`).join("")}</div>`
    : "";
  el.innerHTML = formHTML() + past;
}

async function send(form) {
  if (!rating) { showToast("Pick a face first", "How are your classes going?"); return; }
  if (STUDENT.isPreview) { showToast("Preview mode", "You're viewing as a student — reviews aren't sent."); return; }
  const comment = form.querySelector("#rvComment").value.trim() || null;
  const change_request = form.querySelector("#rvChange").value.trim() || null;
  sending = true;
  form.querySelector("button[type=submit]").disabled = true;
  form.querySelector("button[type=submit]").textContent = "Sending…";
  const { data, error } = await supabase.from("class_reviews")
    .insert({ student_id: STUDENT.id, cohort_id: STUDENT.cohortId, rating, comment, change_request })
    .select("id, rating, comment, change_request, created_at, read_at").single();
  sending = false;
  if (error) {
    form.querySelector("button[type=submit]").disabled = false;
    form.querySelector("button[type=submit]").textContent = "Send review";
    showToast("Couldn't send", "Check your connection and try again.");
    return;
  }
  mine.unshift(data);
  rating = 0;
  justSent = true;
  render();
}

function wire() {
  if (wired) return;
  wired = true;
  area().addEventListener("click", (e) => {
    const r = e.target.closest("[data-rv-rate]");
    if (r) {
      rating = Number(r.dataset.rvRate);
      area().querySelectorAll("[data-rv-rate]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rvRate) === rating)));
      return;
    }
    if (e.target.closest("[data-rv-again]")) { justSent = false; render(); }
  });
  area().addEventListener("submit", (e) => {
    if (e.target.id !== "reviewForm") return;
    e.preventDefault();
    if (!sending) send(e.target);
  });
}

export async function initReview() {
  if (!area()) return;
  wire();
  const { data, error } = await supabase.from("class_reviews")
    .select("id, rating, comment, change_request, created_at, read_at")
    .eq("student_id", STUDENT.id).order("created_at", { ascending: false });
  if (error) loadError = error.message;
  else mine = data;
  render();
}
