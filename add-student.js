/* Wires the "Add Student" form (Students view, teacher.html) to the
   create-student Edge Function. Runs as a module — see teacher-auth-guard.js
   for the script-order reasoning. */

import { supabase, SUPABASE_URL, COHORTS, COURSES, subjectsForCourses } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);

/* Course checkboxes — she picks what she sells (Pakistan Studies /
   Islamiyat); subjectsForCourses() expands to the subject ids stored on the
   student. Both start ticked, since taking both is the common case. */
function renderCoursePicker() {
  $("asCourses").innerHTML = COURSES.map((c) => `
    <label class="course-option on">
      <input type="checkbox" value="${c.id}" checked>
      <span>${c.name}</span>
    </label>`).join("");
}

function selectedCourseIds() {
  return [...$("asCourses").querySelectorAll("input:checked")].map((i) => i.value);
}

renderCoursePicker();

$("asCourses").addEventListener("change", (e) => {
  const box = e.target.closest("input[type=checkbox]");
  if (box) box.closest(".course-option").classList.toggle("on", box.checked);
});

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
  const courseIds = selectedCourseIds();

  if (password.length < 8) {
    $("asError").textContent = "Password should be at least 8 characters.";
    $("asError").hidden = false;
    return;
  }
  if (!courseIds.length) {
    $("asError").textContent = "Pick at least one subject for this student.";
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
      body: JSON.stringify({
        name, email, password,
        cohortId: cohort.id,
        cohortName: cohort.name,
        subjects: subjectsForCourses(courseIds),
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Something went wrong — please try again.");

    document.querySelector(".as-result-title").textContent = "Account created — send these to the student:";
    $("asResultEmail").textContent = email;
    $("asResultPassword").textContent = password;
    $("asResult").hidden = false;
    $("addStudentForm").reset();
    renderCoursePicker(); // reset() restores the checked state but not the .on styling
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
