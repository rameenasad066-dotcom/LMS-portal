/* Weekly Test posting (teacher.html) — replaces the old current.json +
   WhatsApp-submission flow. Miss Rameen posts a PDF + a hard cutoff time;
   students upload photos on the portal itself and the cutoff is enforced
   server-side (see supabase/migrations/weekly-tests.sql), not just hidden
   in the UI. Read-only here re: grading — per her choice, this feature only
   collects uploads + timestamps; marks are still entered as a separate
   "Test" type Assignment if she wants them graded in-portal. Runs as a
   module — see teacher-auth-guard.js for the script-order reasoning. */

import { supabase } from "./supabase-config.js";
import { safeFileName } from "./storage-upload.js";

const $ = (id) => document.getElementById(id);

let openTestId = null;
let currentPdfPath = null;

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

async function renderArea() {
  if (openTestId) await renderDetailView();
  else await renderListView();
}

// Shared by the list row's delete button and the detail view's delete
// button — collects the storage files (PDF + every student's uploaded
// photos) before the row delete cascades away the DB records that point to
// them, then removes the files after.
async function deleteWeeklyTest(id, pdfPath, title) {
  if (!confirm(`Delete "${title}"? All student uploads go with it. This can't be undone.`)) return false;

  const { data: subs } = await supabase
    .from("weekly_test_submissions").select("file_paths").eq("weekly_test_id", id);
  const photoPaths = (subs || []).flatMap((s) => s.file_paths || []);

  const { error } = await supabase.from("weekly_tests").delete().eq("id", id);
  if (error) {
    showToast("Couldn't delete", error.message);
    return false;
  }
  if (photoPaths.length) await supabase.storage.from("submissions").remove(photoPaths);
  if (pdfPath) await supabase.storage.from("weekly-tests").remove([pdfPath]);

  showToast("Weekly test deleted", "Its uploads were removed too.");
  return true;
}

async function renderListView() {
  const area = $("weeklyTestArea");
  $("wtHint").textContent = `Posts to ${COHORT_DATA[activeCohort].name}`;

  const { data: tests, error } = await supabase
    .from("weekly_tests")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("created_at", { ascending: false });

  if (error) {
    area.innerHTML = `<p class="empty-note">Couldn't load weekly tests: ${esc(error.message)}</p>`;
    return;
  }

  const subCounts = {};
  if (tests.length) {
    const ids = tests.map((t) => t.id);
    const { data: subs } = await supabase
      .from("weekly_test_submissions")
      .select("weekly_test_id")
      .in("weekly_test_id", ids);
    (subs || []).forEach((s) => { subCounts[s.weekly_test_id] = (subCounts[s.weekly_test_id] || 0) + 1; });
  }

  area.innerHTML = `
    <form class="settings-form" id="createWtForm">
      <label for="wtTitle">Title</label>
      <input type="text" id="wtTitle" required placeholder="e.g. Weekly Test 5 — Mughal Empire">
      <label for="wtFile">Test paper (PDF)</label>
      <input type="file" id="wtFile" accept="application/pdf" required>
      <label for="wtCloses">Uploads close at</label>
      <input type="datetime-local" id="wtCloses" required>
      <span class="date-hint">Students can't upload anything after this moment — set it a few minutes past when the test actually ends.</span>
      <p class="auth-error" id="wtError" hidden></p>
      <button type="submit" class="btn btn-primary" id="wtSubmitBtn">Post to students</button>
    </form>

    <h3 class="list-title spaced">Posted</h3>
    <ul class="asg-list">
      ${tests.map((t) => `
      <li class="upload-item">
        <span class="u-info">
          <strong></strong>
          <small>Closes ${fmtDateTime(t.closes_at)} · ${subCounts[t.id] || 0} uploaded</small>
        </span>
        <button class="btn btn-outline btn-sm" data-open-wt="${t.id}">Open →</button>
        <button class="kebab" data-delete-wt-list="${t.id}" data-delete-wt-pdf="${esc(t.pdf_path)}" data-delete-wt-title="${esc(t.title)}" aria-label="Delete ${esc(t.title)}">${ICONS.trash}</button>
      </li>`).join("")}
    </ul>
    ${tests.length ? "" : "<p class=\"empty-note\">Nothing posted yet — post this week's test above.</p>"}`;

  area.querySelectorAll(".u-info strong").forEach((el, i) => {
    el.textContent = tests[i].title;
  });
}

async function renderDetailView() {
  const area = $("weeklyTestArea");
  const { data: t, error } = await supabase.from("weekly_tests").select("*").eq("id", openTestId).single();
  if (error || !t) {
    openTestId = null;
    return renderListView();
  }
  currentPdfPath = t.pdf_path;
  const closed = new Date() > new Date(t.closes_at);
  $("wtHint").textContent = `Closes ${fmtDateTime(t.closes_at)} · ${closed ? "Closed" : "Open"}`;

  const [{ data: students }, { data: subs }] = await Promise.all([
    supabase.from("students").select("id, name, initials").eq("cohort_id", t.cohort_id).order("name"),
    supabase.from("weekly_test_submissions").select("*").eq("weekly_test_id", t.id),
  ]);

  const subBy = {};
  (subs || []).forEach((s) => { subBy[s.student_id] = s; });

  const rows = (students || []).map((st) => {
    const sub = subBy[st.id];
    const status = sub
      ? `<span class="status-pill ontime">Uploaded</span> <span class="asg-meta">${fmtDateTime(sub.submitted_at)}</span>`
      : '<span class="status-pill muted">No upload</span>';
    const files = sub && sub.file_paths.length
      ? sub.file_paths.map((p, i) => `<button class="btn btn-outline btn-sm" data-file-path="${esc(p)}">File ${i + 1}</button>`).join(" ")
      : "—";
    return `
    <tr>
      <td><span class="student-cell"><span class="avatar-initials sm">${esc(st.initials)}</span>${esc(st.name)}</span></td>
      <td>${status}</td>
      <td><span class="asg-files">${files}</span></td>
    </tr>`;
  }).join("");

  area.innerHTML = `
    <div class="asg-detail-head">
      <button class="btn btn-outline btn-sm" data-back-wt>← All weekly tests</button>
      <strong class="asg-detail-title"></strong>
      <button type="button" class="btn btn-outline btn-sm" data-view-pdf>View test paper</button>
      <button class="btn btn-outline btn-sm asg-delete" data-delete-wt>Delete</button>
    </div>
    <div class="table-wrap">
      <table class="sub-table">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Status</th>
            <th scope="col">Files</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${(students || []).length ? "" : '<p class="empty-note">No students in this cohort yet.</p>'}`;

  area.querySelector(".asg-detail-title").textContent = t.title;
}

$("weeklyTestArea").addEventListener("submit", async (e) => {
  if (e.target.id !== "createWtForm") return;
  e.preventDefault();
  $("wtError").hidden = true;

  const title = $("wtTitle").value.trim();
  const file = $("wtFile").files[0];
  const closesLocal = $("wtCloses").value;

  if (!file) {
    $("wtError").textContent = "Choose the test paper PDF first.";
    $("wtError").hidden = false;
    return;
  }
  if (file.type !== "application/pdf") {
    $("wtError").textContent = "Only PDF files are supported.";
    $("wtError").hidden = false;
    return;
  }
  if (!closesLocal) {
    $("wtError").textContent = "Set when uploads should close.";
    $("wtError").hidden = false;
    return;
  }

  const btn = $("wtSubmitBtn");
  btn.disabled = true;
  try {
    const path = `${activeCohort}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("weekly-tests").upload(path, file);
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("weekly_tests").insert({
      cohort_id: activeCohort,
      title,
      pdf_path: path,
      closes_at: new Date(closesLocal).toISOString(),
    });
    if (insertError) throw insertError;

    showToast("Posted", `Now visible to ${COHORT_DATA[activeCohort].name} students.`);
    await renderListView();
  } catch (err) {
    $("wtError").textContent = err.message || "Couldn't post — please try again.";
    $("wtError").hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$("weeklyTestArea").addEventListener("click", async (e) => {
  const openBtn = e.target.closest("[data-open-wt]");
  if (openBtn) {
    openTestId = openBtn.dataset.openWt;
    await renderDetailView();
    return;
  }

  if (e.target.closest("[data-back-wt]")) {
    openTestId = null;
    await renderListView();
    return;
  }

  const delListBtn = e.target.closest("[data-delete-wt-list]");
  if (delListBtn) {
    const ok = await deleteWeeklyTest(delListBtn.dataset.deleteWtList, delListBtn.dataset.deleteWtPdf, delListBtn.dataset.deleteWtTitle);
    if (ok) await renderListView();
    return;
  }

  const delBtn = e.target.closest("[data-delete-wt]");
  if (delBtn) {
    const title = $("weeklyTestArea").querySelector(".asg-detail-title").textContent;
    const ok = await deleteWeeklyTest(openTestId, currentPdfPath, title);
    if (ok) {
      openTestId = null;
      await renderListView();
    }
    return;
  }

  const pdfBtn = e.target.closest("[data-view-pdf]");
  if (pdfBtn) {
    const { data, error } = await supabase.storage.from("weekly-tests").createSignedUrl(currentPdfPath, 60);
    if (error || !data) {
      showToast("Couldn't open file", "Please try again in a moment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
    return;
  }

  const fileBtn = e.target.closest("[data-file-path]");
  if (fileBtn) {
    const { data, error } = await supabase.storage.from("submissions").createSignedUrl(fileBtn.dataset.filePath, 60);
    if (error || !data) {
      showToast("Couldn't open file", "Please try again in a moment.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
    return;
  }
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    openTestId = null;
    renderArea();
  })
);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "weekly-test") renderArea();
});

window.dataReadyPromise.then(renderArea);
