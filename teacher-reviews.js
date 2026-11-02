/* Student Reviews (teacher.html) — every private review students leave on
   their Review page, newest first, for the active cohort. Unread reviews
   (read_at null) drive a "new review" card at the top of the dashboard and a
   count on the sidebar item, across BOTH cohorts so none are missed; opening
   the page marks the ones shown as read. Checks for new ones on tab focus
   and every two minutes. Database rules: supabase/migrations/class-reviews.sql. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const view = document.querySelector('[data-view="reviews"]');
const POLL_MS = 120000;
const FACES = { 1: ["😟", "Not good"], 2: ["🙁", "Could be better"], 3: ["😐", "Okay"], 4: ["🙂", "Good"], 5: ["😄", "Loving it"] };

let reviews = [];
let freshIds = new Set();
// Reviews that were unread when first shown this session keep their New tag
// even after a reload of the page has already marked them read.
const seenFresh = new Set();
let loadError = "";
let seq = 0;

const escapeHTML = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const viewVisible = () => !view.hidden;

async function refreshUnread() {
  const { data, error } = await supabase.from("class_reviews").select("cohort_id").is("read_at", null);
  const nudge = $("reviewsNudge"), badge = $("reviewsBadge");
  if (error || !data.length) { nudge.hidden = true; badge.hidden = true; return; }
  const byCohort = {};
  data.forEach((r) => { byCohort[r.cohort_id] = (byCohort[r.cohort_id] || 0) + 1; });
  const parts = Object.entries(byCohort).map(([c, n]) => `${n} from ${COHORT_DATA[c] ? COHORT_DATA[c].name : c}`);
  const n = data.length;
  $("reviewsNudgeLabel").textContent = `${n === 1 ? "A student left you a new review" : `${n} new reviews from your students`} (${parts.join(", ")}).`;
  nudge.hidden = false;
  badge.textContent = n > 9 ? "9+" : String(n);
  badge.setAttribute("aria-label", `${n} unread`);
  badge.hidden = false;
}

async function load() {
  const mine = ++seq;
  const cohort = activeCohort;
  const { data, error } = await supabase.from("class_reviews")
    .select("id, rating, comment, change_request, created_at, read_at, students(name)")
    .eq("cohort_id", cohort).order("created_at", { ascending: false });
  if (mine !== seq) return;
  loadError = error ? "Run class-reviews.sql in Supabase to turn this on." : "";
  reviews = error ? [] : data;
  const unread = reviews.filter((r) => !r.read_at).map((r) => r.id);
  unread.forEach((id) => seenFresh.add(id));
  freshIds = new Set(reviews.filter((r) => seenFresh.has(r.id)).map((r) => r.id));
  render();
  if (unread.length) {
    const now = new Date().toISOString();
    const { error: upErr } = await supabase.from("class_reviews").update({ read_at: now }).in("id", unread);
    if (upErr) console.warn("[reviews] couldn't mark read", upErr.message);
    refreshUnread();
  }
}

function render() {
  const area = $("reviewsArea");
  $("reviewsHint").textContent = loadError ? "" : `${COHORT_DATA[activeCohort].name} · only you can see these`;
  if (loadError) { area.innerHTML = `<p class="empty-note">${escapeHTML(loadError)}</p>`; return; }
  if (!reviews.length) { area.innerHTML = '<p class="empty-note">No reviews from this cohort yet. Students can leave one from the Review page in their portal.</p>'; return; }

  const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const thisMonth = reviews.filter((r) => new Date(r.created_at) >= monthStart).length;
  const face = FACES[Math.round(avg)] || FACES[3];

  area.innerHTML = `
    <div class="rv-summary">
      <div><b>${face[0]} ${avg.toFixed(1)}</b><span>average out of 5</span></div>
      <div><b>${reviews.length}</b><span>review${reviews.length === 1 ? "" : "s"} in total</span></div>
      <div><b>${thisMonth}</b><span>this month</span></div>
    </div>
    <div class="rv-list">${reviews.map((r) => {
      const [emoji, label] = FACES[r.rating] || FACES[3];
      return `
      <article class="rv-card ${freshIds.has(r.id) ? "fresh" : ""}">
        <div class="rv-card-head">
          <span class="rv-card-face" aria-hidden="true">${emoji}</span>
          <div class="rv-card-who"><b>${escapeHTML(r.students ? r.students.name : "A former student")}</b><small>${fmt(r.created_at)} · ${label}</small></div>
          ${freshIds.has(r.id) ? '<span class="rv-new">New</span>' : ""}
          <button type="button" class="btn btn-outline btn-sm asg-delete" data-rv-delete="${r.id}">Delete</button>
        </div>
        ${r.comment ? `<p class="rv-text">${escapeHTML(r.comment)}</p>` : ""}
        ${r.change_request ? `<p class="rv-text rv-change"><span>Would like changed / more of</span>${escapeHTML(r.change_request)}</p>` : ""}
        ${!r.comment && !r.change_request ? '<p class="rv-text rv-none">Rating only, no comment.</p>' : ""}
      </article>`;
    }).join("")}</div>`;
}

$("reviewsArea").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-rv-delete]");
  if (!del || !confirm("Delete this review? This can't be undone.")) return;
  const { error } = await supabase.from("class_reviews").delete().eq("id", del.dataset.rvDelete);
  if (error) { showToast("Couldn't delete", error.message); return; }
  reviews = reviews.filter((r) => r.id !== del.dataset.rvDelete);
  render();
  showToast("Review deleted", "");
});

document.addEventListener("swr-view", (e) => { if (e.detail === "reviews") load(); });
document.querySelectorAll(".pill").forEach((pill) => pill.addEventListener("click", () => { if (viewVisible()) load(); }));
window.addEventListener("focus", refreshUnread);
setInterval(() => { if (!document.hidden) refreshUnread(); }, POLL_MS);

window.dataReadyPromise.then(() => {
  refreshUnread();
  if (viewVisible()) load();
});
