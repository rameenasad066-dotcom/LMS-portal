/* Real student roster (Students view, teacher.html) — replaces the old
   fake ROSTER array in teacher.js. Shows real students for the active
   cohort (needs the "Teacher can view all students" RLS policy from
   assignments.sql), their submission count, and a Reset Password action —
   the actual fix for a forgotten password, since the original can never be
   recovered (see reset-student-password Edge Function). Runs as a
   module — see teacher-auth-guard.js for the script-order reasoning. */

import { supabase, SUPABASE_URL, COHORTS } from "./supabase-config.js";
import { openStudentReport } from "./teacher-student-report.js";

const $ = (id) => document.getElementById(id);

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function renderRosterReal() {
  const body = $("rosterBody");
  const hint = $("rosterHint");
  const empty = $("rosterEmpty");

  const { data: students, error } = await supabase
    .from("students")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("name");

  if (error) {
    body.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load students: ${error.message}`;
    return;
  }

  const statEl = $("statStudents");
  if (statEl) statEl.textContent = String(students.length);
  const statSub = $("statStudentsSub");
  if (statSub) statSub.textContent = "Enrolled in this cohort";

  hint.textContent = `${students.length} student${students.length === 1 ? "" : "s"} in ${COHORT_DATA[activeCohort].name}`;
  empty.hidden = students.length > 0;

  let subCounts = {};
  if (students.length) {
    const { data: subs } = await supabase
      .from("submissions")
      .select("student_id")
      .in("student_id", students.map((s) => s.id));
    (subs || []).forEach((s) => { subCounts[s.student_id] = (subCounts[s.student_id] || 0) + 1; });
  }

  body.innerHTML = students.map((s) => `
    <tr data-student-id="${s.id}">
      <td><button class="student-cell student-cell-link" data-open-report="${s.id}"><span class="avatar-initials sm">${esc(s.initials)}</span>${esc(s.name)}</button></td>
      <td>${esc(s.email)}</td>
      <td>${fmtDate(s.created_at)}</td>
      <td>${subCounts[s.id] || 0}</td>
      <td>
        <span class="roster-actions">
          <select class="tool-select roster-cohort-select" data-shift-cohort="${s.id}" data-shift-name="${esc(s.name)}" data-current-cohort="${s.cohort_id}" aria-label="Cohort for ${esc(s.name)}">
            ${COHORTS.map((c) => `<option value="${c.id}" ${c.id === s.cohort_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
          </select>
          <button class="btn btn-outline btn-sm" data-reset-pw="${s.id}" data-reset-name="${esc(s.name)}" data-reset-email="${esc(s.email)}">Reset password</button>
          <button class="btn btn-outline btn-sm roster-remove" data-remove-student="${s.id}" data-remove-name="${esc(s.name)}">Remove</button>
        </span>
      </td>
    </tr>`).join("");
}

document.getElementById("rosterBody").addEventListener("change", async (e) => {
  const select = e.target.closest("[data-shift-cohort]");
  if (!select) return;

  const studentId = select.dataset.shiftCohort;
  const name = select.dataset.shiftName;
  const fromCohort = select.dataset.currentCohort;
  const toCohort = select.value;
  if (toCohort === fromCohort) return;

  const toName = (COHORTS.find((c) => c.id === toCohort) || {}).name || toCohort;
  if (!confirm(`Move ${name} to ${toName}? They'll disappear from this cohort's dashboard, scoreboard, and roster and show up under ${toName} instead.`)) {
    select.value = fromCohort;
    return;
  }

  select.disabled = true;
  try {
    const { error } = await supabase
      .from("students")
      .update({ cohort_id: toCohort, cohort_name: toName })
      .eq("id", studentId);
    if (error) throw error;
    showToast("Cohort updated", `${name} is now in ${toName}.`);
    await renderRosterReal();
  } catch (err) {
    select.value = fromCohort;
    select.disabled = false;
    showToast("Couldn't move student", err.message || "Please try again.");
  }
});

document.getElementById("rosterBody").addEventListener("click", async (e) => {
  const reportBtn = e.target.closest("[data-open-report]");
  if (reportBtn) {
    openStudentReport(reportBtn.dataset.openReport);
    return;
  }

  const removeBtn = e.target.closest("[data-remove-student]");
  if (removeBtn) {
    const studentId = removeBtn.dataset.removeStudent;
    const name = removeBtn.dataset.removeName;
    if (!confirm(`Remove ${name}? This permanently deletes their account and everything tied to it — marks, submissions, attendance, quiz history. This can't be undone.`)) return;

    removeBtn.disabled = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/remove-student`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studentId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Something went wrong — please try again.");

      showToast("Student removed", `${name}'s account and data have been deleted.`);
      await renderRosterReal();
    } catch (err) {
      removeBtn.disabled = false;
      showToast("Couldn't remove student", err.message || "Please try again.");
    }
    return;
  }

  const btn = e.target.closest("[data-reset-pw]");
  if (!btn) return;

  const studentId = btn.dataset.resetPw;
  const name = btn.dataset.resetName;
  const email = btn.dataset.resetEmail;

  const suggested = randomPassword();
  const newPassword = prompt(`New password for ${name} (edit this, or keep the suggestion):`, suggested);
  if (!newPassword) return;
  if (newPassword.length < 8) {
    showToast("Too short", "Password should be at least 8 characters — try again.");
    return;
  }

  btn.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/reset-student-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ studentId, newPassword }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Something went wrong — please try again.");

    $("asResultEmail").textContent = email;
    $("asResultPassword").textContent = newPassword;
    document.querySelector('.as-result-title').textContent = `Password reset for ${name} — send these to them:`;
    $("asResult").hidden = false;
    $("asResult").scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("Password reset", `${name}'s new password is ready to copy below.`);
  } catch (err) {
    showToast("Couldn't reset password", err.message || "Please try again.");
  } finally {
    btn.disabled = false;
  }
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderRosterReal)
);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "students") renderRosterReal();
});

window.dataReadyPromise.then(renderRosterReal);
