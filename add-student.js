/* Wires the "Add Student" form (Students view, teacher.html) to the
   create-student Edge Function. Runs as a module — see teacher-auth-guard.js
   for the script-order reasoning. */

import { supabase, SUPABASE_URL, COHORTS } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function populateCohorts() {
  $("asCohort").innerHTML = COHORTS.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

function regeneratePassword() {
  $("asPassword").value = randomPassword();
}

populateCohorts();

$("asRegenBtn").addEventListener("click", regeneratePassword);

$("addStudentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("asError").hidden = true;
  $("asResult").hidden = true;

  const name = $("asName").value.trim();
  const email = $("asEmail").value.trim();
  const password = $("asPassword").value;
  const cohort = COHORTS.find((c) => c.id === $("asCohort").value);

  if (password.length < 8) {
    $("asError").textContent = "Password should be at least 8 characters.";
    $("asError").hidden = false;
    return;
  }

  const btn = $("addStudentForm").querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-student`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, password, cohortId: cohort.id, cohortName: cohort.name }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Something went wrong — please try again.");

    document.querySelector(".as-result-title").textContent = "Account created — send these to the student:";
    $("asResultEmail").textContent = email;
    $("asResultPassword").textContent = password;
    $("asResult").hidden = false;
    $("addStudentForm").reset();
  } catch (err) {
    const el = $("asError");
    el.textContent = (err && err.message) || "Something went wrong — please try again.";
    el.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$("asCopyBtn").addEventListener("click", async () => {
  const text = `Email: ${$("asResultEmail").textContent}\nPassword: ${$("asResultPassword").textContent}`;
  try {
    await navigator.clipboard.writeText(text);
    $("asCopyBtn").textContent = "Copied!";
    setTimeout(() => { $("asCopyBtn").textContent = "Copy to clipboard"; }, 1500);
  } catch {
    /* Clipboard unavailable — credentials are still visible on screen to copy manually */
  }
});
