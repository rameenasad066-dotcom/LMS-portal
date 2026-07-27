/* Wires the Broadcast Noticeboard (Students... dashboard, teacher.html) to a
   real, cohort-scoped `announcements` table — replaces the old ANNOUNCEMENTS
   array in data.js, which only ever updated the teacher's own browser tab
   and never actually reached students. Runs as a module — see
   teacher-auth-guard.js for the script-order reasoning. Broadcasts go to
   whichever cohort is currently selected via the cohort pills at the top of
   the dashboard (the same `activeCohort` the rest of the page already uses). */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const TAG_LABEL = { pinned: "Pinned", action: "Action", info: "Update" };

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function noticeItemHTML(a) {
  return `
    <li class="ann-item ${a.tag}">
      <div class="ann-top">
        <span class="ann-tag">${TAG_LABEL[a.tag] || "Update"}</span>
        <span class="ann-date">${fmtDate(a.created_at)}</span>
      </div>
      <strong>${esc(a.title)}</strong>
      <p>${esc(a.body)}</p>
    </li>`;
}

async function renderNoticesReal() {
  const list = document.querySelector('[data-list="notices"]');
  const hint = document.getElementById("broadcastHint");
  if (hint) hint.textContent = `Posts instantly to ${COHORT_DATA[activeCohort].name} students`;

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    list.innerHTML = `<li class="ann-item info"><p>Couldn't load announcements: ${esc(error.message)}</p></li>`;
    return;
  }
  list.innerHTML = data.length
    ? data.map(noticeItemHTML).join("")
    : `<li class="ann-item info"><p>Nothing broadcast to this cohort yet.</p></li>`;
}

$("noticeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("noticeInput");
  const text = input.value.trim();
  if (!text) return;

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const { error } = await supabase.from("announcements").insert({
      cohort_id: activeCohort,
      tag: "action",
      title: text,
      body: "Posted just now.",
    });
    if (error) throw error;
    input.value = "";
    await renderNoticesReal();
    showToast("Announcement broadcast", `Now visible to ${COHORT_DATA[activeCohort].name} students.`);
  } catch (err) {
    showToast("Broadcast failed", err.message || "Something went wrong — please try again.");
  } finally {
    btn.disabled = false;
  }
});

// Re-render whenever the cohort pill selection changes, same as every other
// cohort-scoped panel on this dashboard.
document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderNoticesReal)
);

renderNoticesReal();
