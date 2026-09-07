/* Real scoreboard (dashboard mini-podium + full Scoreboard page,
   student.html) — Phase 2 of the progress system. Calls the same
   get_scoreboard() Postgres function the teacher side uses — raw marks/
   percentages never leave it, only names + ranks. Exported rather than
   self-running because it needs STUDENT.cohortId — auth-guard.js calls
   this once the profile has resolved.

   Month picker (2026-09-04) — get_scoreboard() used to be hard-locked to
   the current calendar month. get_scoreboard_months() supplies the
   dropdown's options.

   Bar-leaderboard redesign (2026-09-04, same day) — the full Scoreboard
   page now renders `data.fullList` as the reference-matched bar-row
   design (see supabase/migrations/scoreboard-bar-redesign.sql): every
   ranked student, bar width from `score` (an aggregate rollup, never a
   raw mark, never printed as a number), ▲/▼/– from `prevRank`. Rows are
   NOT clickable here — the click-to-expand marks/attendance detail is
   teacher-only, on the teacher-scoreboard.js side of this same feature.
   The Dashboard's small mini-podium widget is untouched — it still reads
   `data.top3` via the pre-existing podiumRowHTML(). */

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

function currentMonthIso() {
  return new Date().toISOString().slice(0, 8) + "01";
}

async function populateMonthSelect() {
  const sel = $("sScoreboardMonth");
  if (!sel) return;

  const { data, error } = await supabase.rpc("get_scoreboard_months", { target_cohort: STUDENT.cohortId });
  const months = error || !data ? [] : data.map((r) => r.month_start);
  const current = currentMonthIso();
  if (!months.includes(current)) months.unshift(current);

  const prevValue = sel.value;
  sel.innerHTML = months
    .map((m) => `<option value="${m}">${m === current ? "This month" : monthLabel(m)}</option>`)
    .join("");
  sel.value = months.includes(prevValue) ? prevValue : current;
  selectedMonth = sel.value === current ? null : sel.value;
}

function rowHTML(entry, maxScore, myId) {
  const isTop = entry.rank === 1;
  const isPodium = entry.rank <= 3;
  const isYou = entry.id === myId;
  const dir = entry.prevRank == null ? "same" : entry.prevRank > entry.rank ? "up" : entry.prevRank < entry.rank ? "down" : "same";
  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";
  const barPct = maxScore > 0 ? Math.round((entry.score / maxScore) * 100) : 0;

  return `
    <div class="sb-row">
      <div class="sb-rank-badge${isTop ? " top" : ""}">${entry.rank}</div>
      <div class="sb-avatar${isTop ? " top" : isPodium ? " podium" : ""}">${esc(entry.initials)}</div>
      <div class="sb-name">${esc(entry.name)}${isYou ? ' <span class="you-tag">YOU</span>' : ""}</div>
      <div class="sb-bar-track"><div class="sb-bar-fill${isTop ? " top" : ""}" style="width:${barPct}%"></div></div>
      <div class="sb-delta ${dir}">${glyph}</div>
    </div>`;
}

export async function renderStudentScoreboard() {
  await populateMonthSelect();

  const { data, error } = await supabase.rpc("get_scoreboard", {
    target_cohort: STUDENT.cohortId,
    target_month: selectedMonth,
  });
  const myId = STUDENT.id || null;
  const isCurrent = !selectedMonth;

  const mini = document.querySelector('[data-list="mini-podium"]');
  const has3 = !error && data && data.top3 && data.top3.length > 0;
  if (mini) mini.innerHTML = has3 ? podiumRowHTML(data.top3, myId) : '<p class="empty-note">No scoreboard yet this month.</p>';

  const hint = $("sScoreboardHint");
  if (hint) hint.textContent = isCurrent ? "Computed live from marked work this month" : "A past month — no longer changes";

  const rows = $("sbRows");
  const empty = $("podiumEmpty");
  if (!rows || !empty) return;

  const fullList = (!error && data && data.fullList) || [];
  const unranked = (!error && data && data.unranked) || [];
  const has = fullList.length > 0;
  rows.hidden = !has;
  empty.hidden = has;

  const unrankedBox = $("sbUnranked");
  if (unrankedBox) {
    unrankedBox.hidden = unranked.length === 0;
    $("sbUnrankedList").innerHTML = unranked
      .map((s) => `<span class="sb-unranked-chip">${esc(s.initials)} · ${esc(s.name)}${s.id === myId ? ' <span class="you-tag">YOU</span>' : ""}</span>`)
      .join("");
  }

  if (error) {
    empty.textContent = `Couldn't load the scoreboard: ${error.message}`;
    rows.innerHTML = "";
    return;
  }
  if (!has) {
    empty.textContent = isCurrent
      ? "No scoreboard yet — the first monthly ranking is published after the first marked assignment."
      : "No scoreboard for that month — nothing was marked in that period.";
    rows.innerHTML = "";
    return;
  }

  const maxScore = Math.max(...fullList.map((r) => r.score));
  rows.innerHTML = fullList.map((entry) => rowHTML(entry, maxScore, myId)).join("");
}

document.addEventListener("change", (e) => {
  if (e.target.id !== "sScoreboardMonth") return;
  renderStudentScoreboard();
});
