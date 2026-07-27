/* Real scoreboard (teacher.html) — Phase 2 of the progress system. Replaces
   the old hardcoded COHORT_SCOREBOARD. Calls the get_scoreboard() Postgres
   function (SECURITY DEFINER — computes ranks server-side so raw marks
   never need to be exposed to the client at all, teacher included; the
   teacher only ever sees the same top-3 highlight students do). Runs as a
   module — see teacher-auth-guard.js for the script-order reasoning. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

async function renderScoreboardReal() {
  const { data, error } = await supabase.rpc("get_scoreboard", { target_cohort: activeCohort });

  const has = !error && data && data.top3 && data.top3.length > 0;
  $("podium").hidden = !has;
  $("scoreNote").hidden = !has;
  $("podiumEmpty").hidden = has;
  $("scoreboardHint").textContent = has
    ? `${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · computed live from marks`
    : "";

  if (error) {
    $("podiumEmpty").hidden = false;
    $("podiumEmpty").textContent = `Couldn't load the scoreboard: ${error.message}`;
    return;
  }
  if (!has) {
    $("podiumEmpty").textContent = "No marks entered yet this month — the scoreboard fills in as you grade work.";
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
}

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderScoreboardReal)
);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "scoreboard") renderScoreboardReal();
});

window.dataReadyPromise.then(renderScoreboardReal);
