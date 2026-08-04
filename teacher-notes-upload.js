/* Wires the "Upload Notes" page (teacher.html) to real Supabase Storage +
   the `notes` table, and lets Miss Rameen create chapters/sub-chapters
   herself (table `chapters`) instead of asking Claude to edit content.json.
   Runs as a module — see teacher-auth-guard.js for the script-order
   reasoning. Uploads go to whichever cohort is currently selected via the
   cohort pills (same `activeCohort` the rest of the dashboard already uses). */

import { supabase } from "./supabase-config.js";
import { loadChapters, topLevelChapters, subChaptersOf, createChapter } from "./chapters-data.js";

const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function populateSubjects() {
  $("unSubject").innerHTML = SUBJECTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
}

function populateChapterDropdown() {
  const chapters = topLevelChapters($("unSubject").value);
  $("unChapter").innerHTML = chapters.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
  populateSubChapterDropdown();
}

function populateSubChapterDropdown() {
  const chapterId = $("unChapter").value;
  const subs = chapterId ? subChaptersOf(chapterId) : [];
  const sel = $("unSubChapter");
  const empty = $("unNoSubChapters");

  if (subs.length) {
    sel.innerHTML = subs.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
    sel.hidden = false;
    empty.hidden = true;
  } else {
    sel.innerHTML = "";
    sel.hidden = true;
    empty.hidden = false;
  }
}

function chapterLabel(chapterId) {
  const c = CHAPTERS.find((x) => x.id === chapterId);
  return c ? c.title : chapterId;
}

async function renderNotesUploadHistory() {
  const list = document.querySelector('[data-list="notes-uploads"]');
  const empty = $("notesUploadsEmpty");
  $("unCohortTag").textContent = COHORT_DATA[activeCohort].name;

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load uploads: ${error.message}`;
    return;
  }

  empty.textContent = "No notes uploaded yet for this cohort.";
  empty.hidden = data.length > 0;
  list.innerHTML = data
    .map(
      (n) => `
    <li class="upload-item">
      <span class="file-chip">${ICONS.pdf}</span>
      <span class="u-info">
        <strong>${esc(n.title)}</strong>
        <small>${esc(subjectName(n.subject))} · ${esc(chapterLabel(n.chapter_id))} · ${fmtDate(n.created_at)}</small>
      </span>
      <span class="u-kind">PDF</span>
      <button class="kebab" data-delete-note="${n.id}" data-delete-path="${esc(n.storage_path)}" data-delete-title="${esc(n.title)}" aria-label="Delete ${esc(n.title)}">${ICONS.trash}</button>
    </li>`
    )
    .join("");
}

document.querySelector('[data-list="notes-uploads"]').addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete-note]");
  if (!btn) return;

  const noteId = btn.dataset.deleteNote;
  const path = btn.dataset.deletePath;
  const title = btn.dataset.deleteTitle;
  if (!confirm(`Delete "${title}"? Students will no longer see it. This can't be undone.`)) return;

  btn.disabled = true;
  try {
    const { error: deleteError } = await supabase.from("notes").delete().eq("id", noteId);
    if (deleteError) throw deleteError;
    if (path) await supabase.storage.from("notes").remove([path]);

    await renderNotesUploadHistory();
    showToast("Note deleted", `${title} was removed.`);
  } catch (err) {
    btn.disabled = false;
    showToast("Couldn't delete", err.message || "Please try again.");
  }
});

window.dataReadyPromise.then(async () => {
  populateSubjects();
  await loadChapters();
  populateChapterDropdown();
  await renderNotesUploadHistory();
});

$("unSubject").addEventListener("change", populateChapterDropdown);
$("unChapter").addEventListener("change", populateSubChapterDropdown);

$("unAddChapterBtn").addEventListener("click", async () => {
  const subjectId = $("unSubject").value;
  const title = prompt(`New chapter name (${subjectName(subjectId)}):`);
  if (!title || !title.trim()) return;
  try {
    const created = await createChapter(subjectId, title.trim());
    populateChapterDropdown();
    $("unChapter").value = created.id;
    populateSubChapterDropdown();
    showToast("Chapter created", `"${title.trim()}" added to ${subjectName(subjectId)}.`);
  } catch (err) {
    showToast("Couldn't create chapter", err.message || "Please try again.");
  }
});

$("unAddSubChapterBtn").addEventListener("click", async () => {
  const chapterId = $("unChapter").value;
  const title = prompt(`New sub-chapter name (inside "${chapterLabel(chapterId)}"):`);
  if (!title || !title.trim()) return;
  try {
    const created = await createChapter($("unSubject").value, title.trim(), chapterId);
    populateSubChapterDropdown();
    $("unSubChapter").value = created.id;
    showToast("Sub-chapter created", `"${title.trim()}" added inside ${chapterLabel(chapterId)}.`);
  } catch (err) {
    showToast("Couldn't create sub-chapter", err.message || "Please try again.");
  }
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderNotesUploadHistory)
);

$("uploadNoteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("unError").hidden = true;

  const subjectId = $("unSubject").value;
  const chapterId = $("unChapter").value;
  const subChapterId = $("unSubChapter").hidden ? null : $("unSubChapter").value;
  const finalChapterId = subChapterId || chapterId;
  const title = $("unTitle").value.trim();
  const file = $("unFile").files[0];

  if (!file) {
    $("unError").textContent = "Choose a PDF file first.";
    $("unError").hidden = false;
    return;
  }
  if (file.type !== "application/pdf") {
    $("unError").textContent = "Only PDF files are supported right now.";
    $("unError").hidden = false;
    return;
  }
  if (!finalChapterId) {
    $("unError").textContent = "Add a chapter first.";
    $("unError").hidden = false;
    return;
  }

  const btn = $("unSubmitBtn");
  btn.disabled = true;
  try {
    const path = `${activeCohort}/${subjectId}/${finalChapterId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("notes").upload(path, file);
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from("notes").insert({
      cohort_id: activeCohort,
      subject: subjectId,
      chapter_id: finalChapterId,
      title,
      storage_path: path,
      size_bytes: file.size,
    });
    if (insertError) throw insertError;

    $("uploadNoteForm").reset();
    populateChapterDropdown();
    await renderNotesUploadHistory();
    showToast("Notes uploaded", `${title} — now visible to ${COHORT_DATA[activeCohort].name} students.`);
  } catch (err) {
    $("unError").textContent = err.message || "Upload failed — please try again.";
    $("unError").hidden = false;
  } finally {
    btn.disabled = false;
  }
});
