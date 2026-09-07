/* Real scoreboard (dashboard mini-podium + full Scoreboard page,
   student.html) — Phase 2 of the progress system. Replaces the old
   hardcoded SCOREBOARD object. Calls the same get_scoreboard() Postgres
   function the teacher side uses — raw marks/percentages never leave it,
   only names + ranks. Exported rather than self-running because it needs
   STUDENT.cohortId — auth-guard.js calls this once the profile has
   resolved.

   Month picker added 2026-09-04 — get_scoreboard() used to be hard-locked
   to the current calendar month, so a student could never look back at a
   finished month's ranking once it rolled over. selectedMonth (an ISO
   'YYYY-MM-01' string, or null for "current") is passed straight through
   to the RPC; get_scoreboard_months() supplies the dropdown's options so
   it only ever offers months that actually have a scoreboard.

   Full ranked list added 2026-09-04, same day — she asked for every
   student's rank to be visible to everyone, not just a top-3 highlight
   plus your own rank. `data.fullList` (every ranked student, in order)
   renders below the podium as `#sRankList`, with the caller's own row
   tagged "YOU" the same way the podium already does. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

let selectedMonth = null; // null = current month

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

function monthLabel(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function populateMonthSelect() {
  const sel = $("sScoreboardMonth");
  if (!sel) return;

  const { data, error } = await supabase.rpc("get_scoreboard_months", { target_cohort: STUDENT.cohortId });
  const months = error || !data ? [] : data.map((r) => r.month_start);
  const currentMonth = new Date().toISOString().slice(0, 8) + "01";
  if (!months.includes(currentMonth)) months.unshift(currentMonth);

  const prevValue = sel.value;
  sel.innerHTML = months
    .map((m) => `<option value="${m}">${m === currentMonth ? "This month" : monthLabel(m)}</option>`)
    .join("");
  sel.value = months.includes(prevValue) ? prevValue : currentMonth;
  selectedMonth = sel.value === currentMonth ? null : sel.value;
}

export async function renderStudentScoreboard() {
  await populateMonthSelect();

  const { data, error } = await supabase.rpc("get_scoreboard", {
    target_cohort: STUDENT.cohortId,
    target_month: selectedMonth,
  });
  const has = !error && data && data.top3 && data.top3.length > 0;
  const myId = STUDENT.id || null;
  const isCurrent = !selectedMonth;

  const mini = document.querySelector('[data-list="mini-podium"]');
  if (mini) mini.innerHTML = has ? podiumRowHTML(data.top3, myId) : '<p class="empty-note">No scoreboard yet this month.</p>';

  const hint = $("sScoreboardHint");
  if (hint) hint.textContent = isCurrent ? "Computed live from marked work this month" : "A past month — no longer changes";

  const rc = document.getElementById("sRankCallout");
  if (rc) {
    rc.textContent = data && data.yourRank
      ? `Your rank: #${data.yourRank}`
      : isCurrent
      ? "Not yet ranked this month — your rank appears once your work is marked."
      : "You weren't ranked that month — no marked work in that period.";
  }

  const podium = document.getElementById("sPodium");
  if (podium) podium.innerHTML = has ? podiumRowHTML(data.top3, myId) : "";

  const rankList = $("sRankList");
  if (rankList) {
    rankList.hidden = !has;
    const fullList = (data && data.fullList) || [];
    rankList.innerHTML = fullList.map((entry) => `
      <li class="rank-list-item${entry.id === myId ? " you" : ""}">
        <span class="rank-list-num">#${entry.rank}</span>
        <span class="avatar-initials sm">${esc(entry.initials)}</span>
        <span class="rank-list-name">${esc(entry.name)}${entry.id === myId ? ' <span class="you-tag">YOU</span>' : ""}</span>
      </li>`).join("");
  }

  const note = document.getElementById("scoreNote");
  if (note) note.hidden = !has;
  const empty = document.getElementById("podiumEmpty");
  if (empty) {
    empty.hidden = has;
    empty.textContent = error
      ? `Couldn't load the scoreboard: ${error.message}`
      : isCurrent
      ? "No scoreboard yet — the first monthly ranking is published after the first marked assignment."
      : "No scoreboard for that month — nothing was marked in that period.";
  }
}

document.addEventListener("change", (e) => {
  if (e.target.id !== "sScoreboardMonth") return;
  renderStudentScoreboard();
});
