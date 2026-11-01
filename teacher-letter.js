/* Sunday Letter (teacher dashboard) — write, post, edit and delete the weekly
   letter for the active cohort, and see how many students have opened each
   one. Students get it as a pink banner + one-time pop-up (student-letter.js).
   The letter is always the teacher's own words; nothing here writes text. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const PKT_OFFSET_MS = 5 * 3600 * 1000;

let letters = [];
let opened = new Map();
let classSize = 0;
let editingId = null;
let loadError = "";
let busy = false;
let seq = 0;

const escapeHTML = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function weekStart() {
  const shifted = Date.now() + PKT_OFFSET_MS;
  const day = new Date(shifted).getUTCDay();
  return shifted - (shifted % 86400000) - day * 86400000 - PKT_OFFSET_MS;
}

async function load() {
  const mine = ++seq;
  const cohort = activeCohort;
  const [l, s] = await Promise.all([
    supabase.from("sunday_letters").select("id, title, preview, body, created_at, letter_views(student_id, opened_at)")
      .eq("cohort_id", cohort).order("created_at", { ascending: false }),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("cohort_id", cohort),
  ]);
  if (mine !== seq) return;
  loadError = l.error ? "Run sunday-letters.sql in Supabase to turn this on." : "";
  letters = l.error ? [] : l.data;
  opened = new Map(letters.map((x) => [x.id, (x.letter_views || []).filter((v) => v.opened_at).length]));
  classSize = s.count || 0;
  render();
}

function formHTML() {
  const l = editingId ? letters.find((x) => x.id === editingId) : null;
  return `
  <form class="lt-form" id="letterForm" novalidate>
    <label for="ltTitleIn">Title</label>
    <input type="text" id="ltTitleIn" maxlength="120" required value="${l ? escapeHTML(l.title) : ""}">
    <label for="ltPreviewIn">One-line preview <span class="lt-count" id="ltPreviewCount">${l ? l.preview.length : 0} / 200</span></label>
    <input type="text" id="ltPreviewIn" maxlength="200" required value="${l ? escapeHTML(l.preview) : ""}">
    <p class="lt-help">Shown on the dashboard banner and the pop-up, so students get an idea of what it's about.</p>
    <label for="ltBodyIn">Letter <span class="lt-count" id="ltBodyCount">${l ? l.body.length : 0} / 6000</span></label>
    <textarea id="ltBodyIn" rows="9" maxlength="6000" required>${l ? escapeHTML(l.body) : ""}</textarea>
    <p class="lt-help">Leave an empty line between paragraphs. Your name is added at the end automatically.</p>
    <div class="lt-form-actions">
      <button type="submit" class="btn btn-primary" ${busy ? "disabled" : ""}>${editingId ? "Save changes" : "Post letter"}</button>
      ${editingId ? '<button type="button" class="btn btn-outline" data-lt-cancel>Cancel</button>' : ""}
    </div>
  </form>`;
}

function render() {
  const sentThisWeek = letters[0] && new Date(letters[0].created_at).getTime() >= weekStart();
  $("letterHint").textContent = loadError ? "" : `${COHORT_DATA[activeCohort].name} · ${sentThisWeek ? "this week's letter is posted" : "no letter yet this week"}`;
  const area = $("letterArea");
  if (loadError) { area.innerHTML = `<p class="empty-note">${escapeHTML(loadError)}</p>`; return; }

  const list = letters.length
    ? `<div class="lt-posted"><h3>Posted letters</h3>${letters.map((l) => `
        <div class="lt-posted-row">
          <div class="lt-posted-main"><b>${escapeHTML(l.title)}</b><span>${fmt(l.created_at)} · opened by ${opened.get(l.id) || 0} of ${classSize} student${classSize === 1 ? "" : "s"}</span></div>
          <div class="lt-posted-actions">
            <button type="button" class="btn btn-outline btn-sm" data-lt-edit="${l.id}">Edit</button>
            <button type="button" class="btn btn-outline btn-sm asg-delete" data-lt-delete="${l.id}">Delete</button>
          </div>
        </div>`).join("")}</div>`
    : "";

  area.innerHTML = `<div class="lt-admin">${formHTML()}${list}</div>`;
}

$("letterArea").addEventListener("input", (e) => {
  if (e.target.id === "ltPreviewIn") $("ltPreviewCount").textContent = `${e.target.value.length} / 200`;
  if (e.target.id === "ltBodyIn") $("ltBodyCount").textContent = `${e.target.value.length} / 6000`;
});

$("letterArea").addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-lt-edit]");
  if (edit) { editingId = edit.dataset.ltEdit; render(); $("ltTitleIn").focus(); return; }
  if (e.target.closest("[data-lt-cancel]")) { editingId = null; render(); return; }
  const del = e.target.closest("[data-lt-delete]");
  if (del) {
    const l = letters.find((x) => x.id === del.dataset.ltDelete);
    if (!l || !confirm(`Delete "${l.title}"? Students won't see it any more.`)) return;
    const { error } = await supabase.from("sunday_letters").delete().eq("id", l.id);
    if (error) { showToast("Couldn't delete", error.message); return; }
    if (editingId === l.id) editingId = null;
    showToast("Letter deleted", l.title);
    load();
  }
});

$("letterArea").addEventListener("submit", async (e) => {
  if (e.target.id !== "letterForm") return;
  e.preventDefault();
  const title = $("ltTitleIn").value.trim();
  const preview = $("ltPreviewIn").value.trim();
  const body = $("ltBodyIn").value.trim();
  if (!title || !preview || !body) { showToast("Almost there", "Fill in the title, the one-line preview and the letter."); return; }
  if (!editingId && !confirm(`Post "${title}" to ${COHORT_DATA[activeCohort].name}? Students will see it straight away.`)) return;

  busy = true;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = editingId ? "Saving…" : "Posting…";
  const { error } = editingId
    ? await supabase.from("sunday_letters").update({ title, preview, body, updated_at: new Date().toISOString() }).eq("id", editingId)
    : await supabase.from("sunday_letters").insert({ cohort_id: activeCohort, title, preview, body });
  busy = false;
  if (error) {
    btn.disabled = false;
    btn.textContent = editingId ? "Save changes" : "Post letter";
    showToast("Couldn't save", error.message);
    return;
  }
  showToast(editingId ? "Letter updated" : "Letter posted", editingId ? title : "Students will see it on their dashboard.");
  editingId = null;
  load();
});

document.querySelectorAll(".pill").forEach((pill) => pill.addEventListener("click", () => { editingId = null; load(); }));
window.dataReadyPromise.then(load);
