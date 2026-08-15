/* Real scoreboard (dashboard mini-podium + full Scoreboard page,
   student.html) — Phase 2 of the progress system. Replaces the old
   hardcoded SCOREBOARD object. Calls the same get_scoreboard() Postgres
   function the teacher side uses — it returns only the top-3 names and the
   caller's own rank, never raw marks or percentages, so the "students see
   ranks only" rule holds even though the calculation genuinely runs across
   the whole cohort's marks. Exported rather than self-running because it
   needs STUDENT.cohortId — auth-guard.js calls this once the profile has
   resolved. */

import { supabase } from "./supabase-config.js";

function podiumColHTML(p, cls, place, myId) {
  return `
  <div class="podium-col ${cls}">
    <span class="avatar-initials sm">${esc(p.initials)}</span>
    <span class="podium-name">${esc(p.name)}${p.id === myId ? '<span class="you-tag">YOU</span>' : ""}</span>
    <div class="podium-bar">${place}</div>
  </div>`;
}

function podiumRowHTML(top3, myId) {
  const [p1, p2, p3] = top3;
  return [
    p2 ? podiumColHTML(p2, "second", 2, myId) : "",
    p1 ? podiumColHTML(p1, "first", 1, myId) : "",
    p3 ? podiumColHTML(p3, "third", 3, myId) : "",
  ].join("");
}

export async function renderStudentScoreboard() {
  const { data, error } = await supabase.rpc("get_scoreboard", { target_cohort: STUDENT.cohortId });
  const has = !error && data && data.top3 && data.top3.length > 0;
  const myId = STUDENT.id || null;

  const mini = document.querySelector('[data-list="mini-podium"]');
  if (mini) mini.innerHTML = has ? podiumRowHTML(data.top3, myId) : '<p class="empty-note">No scoreboard yet this month.</p>';

  const rc = document.getElementById("sRankCallout");
  if (rc) {
    rc.textContent = data && data.yourRank
      ? `Your rank: #${data.yourRank} · visible only to you`
      : "Not yet ranked this month — your rank appears once your work is marked.";
  }

  const podium = document.getElementById("sPodium");
  if (podium) podium.innerHTML = has ? podiumRowHTML(data.top3, myId) : "";
  const note = document.getElementById("scoreNote");
  if (note) note.hidden = !has;
  const empty = document.getElementById("podiumEmpty");
  if (empty) {
    empty.hidden = has;
    empty.textContent = error
      ? `Couldn't load the scoreboard: ${error.message}`
      : "No scoreboard yet — the first monthly ranking is published after the first marked assignment.";
  }
}
