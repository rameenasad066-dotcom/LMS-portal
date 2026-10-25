/* Weekly Test (student.html) — replaces the old current.json + WhatsApp
   flow. Download the test paper, upload photos of the finished paper before
   the teacher's cutoff, see the exact time you uploaded. The cutoff is
   enforced server-side (supabase/migrations/weekly-tests.sql) — hiding the
   form here is just the UI half, not the real boundary. Exported rather
   than self-running because it needs STUDENT.cohortId — auth-guard.js calls
   renderStudentWeeklyTest() once the profile has resolved. */

import { supabase } from "./supabase-config.js";
import { uploadToSubmissions, retryNetwork, isNetworkError, forgetStored } from "./storage-upload.js";

const ICON_PDF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// A device's own clock/timezone is often wrong (phones especially — auto-
// time off, wrong region), which would make the "uploads closed" UI decision
// wrong too. Sync once against the server's real clock and use that offset
// everywhere instead of trusting Date.now() directly. The actual cutoff is
// still enforced server-side in Postgres regardless — this only fixes what
// the page decides to *show*.
let clockOffsetMs = 0;

async function syncServerClock() {
  const { data, error } = await supabase.rpc("get_server_time");
  if (!error && data) clockOffsetMs = new Date(data).getTime() - Date.now();
}

function serverNow() {
  return Date.now() + clockOffsetMs;
}

// Same bands as My Grades (90 A*, 80 A, 70 B, 60 C, 50 D, else U).
function letterGrade(pct) {
  if (pct >= 90) return { label: "A*", cls: "" };
  if (pct >= 80) return { label: "A", cls: "" };
  if (pct >= 70) return { label: "B", cls: "mid" };
  if (pct >= 60) return { label: "C", cls: "mid" };
  if (pct >= 50) return { label: "D", cls: "risk" };
  return { label: "U", cls: "risk" };
}

function leftText(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d >= 1) return `${d} d ${h} h left`;
  if (h >= 1) return `${h} h ${mins % 60} min left`;
  return mins >= 1 ? `${mins} min left` : "less than a minute left";
}

export async function renderStudentWeeklyTest() {
  const area = document.getElementById("weeklyArea");
  if (!area) return;

  await syncServerClock();

  const { data: allTests, error } = await supabase
    .from("weekly_tests")
    .select("*")
    .eq("cohort_id", STUDENT.cohortId)
    .order("created_at", { ascending: false });

  // RLS already limits a student to their own courses' tests; this repeats
  // it for preview mode, where the teacher's RLS returns every test.
  const mine = STUDENT.subjects || [];
  const tests = (allTests || []).filter((t) => !t.subjects || t.subjects.some((s) => mine.includes(s)));

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

  const assignmentIds = tests.map((t) => t.assignment_id).filter(Boolean);
  const markBy = {};
  if (assignmentIds.length) {
    const { data: marks } = await supabase
      .from("marks")
      .select("assignment_id, marks, feedback")
      .in("assignment_id", assignmentIds)
      .eq("student_id", STUDENT.id);
    (marks || []).forEach((m) => { markBy[m.assignment_id] = m; });
  }

  const pdfUrls = {};
  await Promise.all(tests.map(async (t) => {
    const { data } = await supabase.storage.from("weekly-tests").createSignedUrl(t.pdf_path, 300);
    if (data) pdfUrls[t.id] = data.signedUrl;
  }));

  area.innerHTML = tests.map((t) => {
    const sub = subBy[t.id];
    const mark = t.assignment_id ? markBy[t.assignment_id] : null;
    const msLeft = new Date(t.closes_at).getTime() - serverNow();
    const closed = msLeft <= 0;
    const state = mark ? "done" : sub ? "wait" : closed ? "miss" : "open";
    const grade = mark && t.max_marks ? letterGrade(Math.round((100 * mark.marks) / t.max_marks)) : null;
    const paper = pdfUrls[t.id]
      ? `<a class="wt-paper" href="${pdfUrls[t.id]}" target="_blank" rel="noopener">
          <span class="wt-paper-icon">${ICON_PDF}</span>
          <span class="wt-paper-info"><strong>Download test paper</strong><small>PDF · opens in a new tab</small></span>
          <span class="wt-paper-cta">${ICON_DOWNLOAD}</span>
        </a>`
      : "";
    const paperLink = pdfUrls[t.id]
      ? `<a class="btn btn-outline btn-sm" href="${pdfUrls[t.id]}" target="_blank" rel="noopener">Download the paper</a>`
      : "";

    const ring = { open: [25, "1/4"], wait: [75, "3/4"], done: [100, "✓"], miss: [50, "✕"] }[state];
    const copy = {
      open: ["Next step", "Download the paper, then upload your answers"],
      wait: ["Almost there", "Waiting for Miss Rameen to mark it"],
      done: ["All done", mark ? `You scored ${mark.marks}${t.max_marks ? `/${t.max_marks}` : ""}${grade ? ` (${grade.label})` : ""}` : ""],
      miss: ["Closed", "This test wasn't uploaded in time"],
    }[state];
    const sub2 = sub ? `Uploaded ${fmtDateTime(sub.submitted_at)}` : state === "miss" ? "Message Miss Rameen if you sent it another way." : "";

    const action = state === "open"
      ? `${paper}
        <form class="asg-upload-form" data-wt-id="${t.id}" data-wt-closes="${t.closes_at}">
          <input type="file" class="asg-file-input" multiple accept="image/*,application/pdf" required aria-label="Choose photos of your answers">
          <small class="asg-meta">Tip: choose files saved on your phone (Downloads or Gallery), not from Google Drive.</small>
          <button type="submit" class="btn btn-primary btn-sm">Upload my answers</button>
        </form>`
      : `${state === "done" && mark.feedback ? '<details class="wt-feedback"><summary>See feedback</summary><p class="wt-feedback-text"></p></details>' : ""}${paperLink}`;

    const meta = !closed ? `Uploads close ${fmtDateTime(t.closes_at)} · ${leftText(msLeft)}` : `Closed ${fmtDateTime(t.closes_at)}`;
    const pill = { open: "To do", wait: "Waiting for marks", done: "Marked", miss: "Not uploaded" }[state];

    return `
    <article class="asg-card wt-card" data-wt-card="${t.id}">
      <div class="wt-head">
        <div><h3 class="weekly-title"></h3><div class="wt-meta">${meta}</div></div>
        <div class="wt-badges">
          ${state === "done" && mark ? `<span class="wt-score">${mark.marks}${t.max_marks ? `/${t.max_marks}` : ""}</span>${grade ? `<span class="grade-chip ${grade.cls}">${grade.label}</span>` : ""}` : ""}
          <span class="wt-pill ${state}">${pill}</span>
        </div>
      </div>
      <div class="wt-ringrow">
        <div class="wt-ring ${state === "miss" ? "bad" : ""}" style="--p:${ring[0]}" role="img" aria-label="${ring[0]} percent complete"><span>${ring[1]}</span></div>
        <div class="wt-next">
          <div class="wt-next-lab">${copy[0]}</div><span class="wt-next-txt">${copy[1]}</span>${sub2 ? `<span class="wt-next-sub">${sub2}</span>` : ""}
        </div>
      </div>
      <div class="wt-action">${action}</div>
    </article>`;
  }).join("");

  tests.forEach((t) => {
    const card = area.querySelector(`[data-wt-card="${t.id}"]`);
    if (!card) return;
    card.querySelector(".weekly-title").textContent = t.title;
    const mark = t.assignment_id ? markBy[t.assignment_id] : null;
    const fb = card.querySelector(".wt-feedback-text");
    if (fb && mark) fb.textContent = mark.feedback;
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
  if (closesAt && serverNow() >= new Date(closesAt).getTime()) {
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
    const prefix = `${STUDENT.id}/wt-${weeklyTestId}`;
    const paths = await uploadToSubmissions(files, prefix, (done, total) => {
      btn.textContent = `Uploading ${done + 1} of ${total}…`;
    });

    btn.textContent = "Saving…";
    const { error: insertError } = await retryNetwork(() => supabase.from("weekly_test_submissions").insert({
      weekly_test_id: weeklyTestId,
      student_id: STUDENT.id,
      file_paths: paths,
    }));
    // 23505 = a row already exists: an earlier try's reply was lost on the way
    // back but the save did land, so this is a success, not a failure.
    if (insertError && insertError.code !== "23505") {
      throw isNetworkError(insertError)
        ? new Error("Your files are uploaded but the final save didn't go through. Check your internet and press the button again — nothing will be re-uploaded.")
        : insertError;
    }
    forgetStored(prefix, files);

    showToast("Uploaded", "Miss Rameen can see your submission time now.");
    await renderStudentWeeklyTest();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Upload my answers";
    showToast("Upload failed", err.message || "Please try again.");
  }
});
