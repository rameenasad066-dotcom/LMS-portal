/* Fetches the Announcement Board (dashboard, student.html) from the real,
   cohort-scoped `announcements` table — replaces the old hardcoded
   ANNOUNCEMENTS array in data.js. Exported rather than self-running because
   it needs STUDENT.cohortId, which is only known once auth-guard.js has
   resolved the signed-in student's real profile — auth-guard.js imports and
   calls this after that resolves. */

import { supabase } from "./supabase-config.js";

const TAG_LABEL = { pinned: "Pinned", action: "Action", info: "Update" };

function fmtDateShort(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export async function renderAnnouncements() {
  const list = document.querySelector('[data-list="announcements"]');
  if (!list) return;

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("cohort_id", STUDENT.cohortId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    list.innerHTML = `<li class="ann-item info"><p>Couldn't load announcements right now.</p></li>`;
    return;
  }

  list.innerHTML = data.length
    ? data
        .map(
          (a) => `
    <li class="ann-item ${a.tag}">
      <div class="ann-top">
        <span class="ann-tag">${TAG_LABEL[a.tag] || "Update"}</span>
        <span class="ann-date">${fmtDateShort(a.created_at)}</span>
      </div>
      <strong>${esc(a.title)}</strong>
      <p>${esc(a.body)}</p>
    </li>`
        )
        .join("")
    : `<li class="ann-item info"><p>No announcements yet — check back after your next class.</p></li>`;
}
