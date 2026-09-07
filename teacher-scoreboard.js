/* Real scoreboard (teacher.html) — Phase 2 of the progress system. Replaces
   the old hardcoded COHORT_SCOREBOARD. Calls the get_scoreboard() Postgres
   function (SECURITY DEFINER — computes ranks server-side so raw marks
   never need to be exposed to the client at all, teacher included). Runs
   as a module — see teacher-auth-guard.js for the script-order reasoning.

   Month picker added 2026-09-04 — get_scoreboard() used to be hard-locked
   to the current calendar month, with no way for her (or a student) to
   look back once it rolled over. get_scoreboard_months() supplies the
   dropdown's options, scoped to whichever cohort pill is active.

   Full ranked list added 2026-09-04, same day — she reported "only 3
   students are showing" and wanted every student's rank visible, not just
   the top-3 podium highlight. `data.fullList` (every ranked student, in
   order) now renders below the podium as `#rankList`; raw marks/percentages
   still never leave get_scoreboard() at all. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

let selectedMonth = null; // null = current month

function currentMonthIso() {
  return new Date().toISOString().slice(0, 8) + "01";
}

function monthLabel(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

async function populateMonthSelect() {
  const sel = $("scoreboardMonth");
  if (!sel) return;

  const { data, error } = await supabase.rpc("get_scoreboard_months", { target_cohort: activeCohort });
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

async function renderScoreboardReal() {
  await populateMonthSelect();

  const { data, error } = await supabase.rpc("get_scoreboard", {
    target_cohort: activeCohort,
    target_month: selectedMonth,
  });

  const has = !error && data && data.top3 && data.top3.length > 0;
  const isCurrent = !selectedMonth;
  $("podium").hidden = !has;
  $("scoreNote").hidden = !has;
  $("rankList").hidden = !has;
  $("podiumEmpty").hidden = has;
  $("scoreboardHint").textContent = has
    ? `${monthLabel(selectedMonth || currentMonthIso())} · computed live from marks`
    : "";

  if (error) {
    $("podiumEmpty").hidden = false;
    $("podiumEmpty").textContent = `Couldn't load the scoreboard: ${error.message}`;
    return;
  }
  if (!has) {
    $("podiumEmpty").textContent = isCurrent
      ? "No marks entered yet this month — the scoreboard fills in as you grade work."
      : "No marks were entered that month.";
    return;
  }

  const col = (entry, place, cls) => `
    <div class="podium-col ${cls}">
      <span class="avatar-initials sm">${esc(entry.initials)}</span>
      <span class="podium-name">${esc(entry.name)}</span>
      <div class="podium-bar">${place}</div>
    </div>`;

  const [p1, p2, p3] = data.top3;
  $("podium").innerHTML = [
    p2 ? col(p2, "2", "second") : "",
    p1 ? col(p1, "1", "first") : "",
    p3 ? col(p3, "3", "third") : "",
  ].join("");

  const fullList = data.fullList || [];
  $("rankList").innerHTML = fullList.map((entry) => `
    <li class="rank-list-item">
      <span class="rank-list-num">#${entry.rank}</span>
      <span class="avatar-initials sm">${esc(entry.initials)}</span>
      <span class="rank-list-name">${esc(entry.name)}</span>
    </li>`).join("");
}

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderScoreboardReal)
);

$("scoreboardMonth").addEventListener("change", renderScoreboardReal);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "scoreboard") renderScoreboardReal();
});

window.dataReadyPromise.then(renderScoreboardReal);
