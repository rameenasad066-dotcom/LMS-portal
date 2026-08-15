/* Weekly Test (student.html) — replaces the old current.json + WhatsApp
   flow. Download the test paper, upload photos of the finished paper before
   the teacher's cutoff, see the exact time you uploaded. The cutoff is
   enforced server-side (supabase/migrations/weekly-tests.sql) — hiding the
   form here is just the UI half, not the real boundary. Exported rather
   than self-running because it needs STUDENT.cohortId — auth-guard.js calls
   renderStudentWeeklyTest() once the profile has resolved. */

import { supabase } from "./supabase-config.js";
import { uploadToSubmissions } from "./storage-upload.js";

const ICON_PDF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export async function renderStudentWeeklyTest() {
  const area = document.getElementById("weeklyArea");
  if (!area) return;

  const { data: tests, error } = await supabase
    .from("weekly_tests")
    .select("*")
    .eq("cohort_id", STUDENT.cohortId)
    .order("created_at", { ascending: false });

  if (error) {
    area.innerHTML = '<p class="empty-note">Couldn\'t load the weekly test right now — try refreshing.</p>';
    return;
  }
  if (!tests.length) {
    area.innerHTML = '<p class="empty-note">Nothing posted yet — this week\'s test from Miss Rameen will appear here.</p>';
    return;
  }

  const ids = tests.map((t) => t.id);
  const { data: subs } = await supabase
    .from("weekly_test_submissions")
    .select("*")
    .in("weekly_test_id", ids)
    .eq("student_id", STUDENT.id);
  const subBy = {};
  (subs || []).forEach((s) => { subBy[s.weekly_test_id] = s; });

  const pdfUrls = {};
  await Promise.all(tests.map(async (t) => {
    const { data } = await supabase.storage.from("weekly-tests").createSignedUrl(t.pdf_path, 300);
    if (data) pdfUrls[t.id] = data.signedUrl;
  }));

  area.innerHTML = tests.map((t) => {
    const sub = subBy[t.id];
    const closed = new Date() > new Date(t.closes_at);

    let statusHTML;
    if (sub) {
      statusHTML = `<p class="asg-meta">Uploaded ${fmtDateTime(sub.submitted_at)}</p>`;
    } else if (closed) {
      statusHTML = '<p class="asg-meta">Uploads are closed for this test.</p>';
    } else {
      statusHTML = `
        <form class="asg-upload-form" data-wt-id="${t.id}" data-wt-closes="${t.closes_at}">
          <input type="file" class="asg-file-input" multiple accept="image/*,application/pdf" required>
          <button type="submit" class="btn btn-primary btn-sm">Upload my answers</button>
        </form>`;
    }

    return `
    <article class="asg-card">
      <div class="deadline-card">
        <div>
          <span class="deadline-label">Uploads ${closed ? "closed" : "close"}</span>
          <strong>${fmtDateTime(t.closes_at)}</strong>
        </div>
        <span class="days-left ${closed ? "urgent" : ""}">${closed ? "Closed" : "Open"}</span>
      </div>
      <h3 class="weekly-title"></h3>
      ${pdfUrls[t.id] ? `
      <a class="wt-paper" href="${pdfUrls[t.id]}" target="_blank" rel="noopener">
        <span class="wt-paper-icon">${ICON_PDF}</span>
        <span class="wt-paper-info">
          <strong>Download test paper</strong>
          <small>PDF · opens in a new tab</small>
        </span>
        <span class="wt-paper-cta">${ICON_DOWNLOAD}</span>
      </a>` : ""}
      <div class="asg-status">${statusHTML}</div>
    </article>`;
  }).join("");

  area.querySelectorAll(".weekly-title").forEach((el, i) => {
    el.textContent = tests[i].title;
  });
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".asg-upload-form");
  if (!form || !form.dataset.wtId) return;
  e.preventDefault();

  const input = form.querySelector(".asg-file-input");
  const files = Array.from(input.files);
  if (!files.length) return;

  // Don't even upload if the cutoff has passed — the server RLS is still the
  // real boundary, but this stops orphaned files landing in storage and gives
  // a clean message instead of leaning on the RLS error text.
  const closesAt = form.dataset.wtCloses;
  if (closesAt && Date.now() >= new Date(closesAt).getTime()) {
    showToast("Uploads closed", "The deadline for this test has passed.");
    await renderStudentWeeklyTest();
    return;
  }

  if (STUDENT.isPreview) {
    showToast("Preview mode", "You're viewing as a student — uploads aren't saved.");
    return;
  }

  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  try {
    const weeklyTestId = form.dataset.wtId;
    const paths = await uploadToSubmissions(files, `${STUDENT.id}/wt-${weeklyTestId}`);

    const { error: insertError } = await supabase.from("weekly_test_submissions").insert({
      weekly_test_id: weeklyTestId,
      student_id: STUDENT.id,
      file_paths: paths,
    });
    if (insertError) throw insertError;

    showToast("Uploaded", "Miss Rameen can see your submission time now.");
    await renderStudentWeeklyTest();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Upload my answers";
    showToast("Upload failed", err.message || "Please try again.");
  }
});
