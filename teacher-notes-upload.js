/* Wires the "Upload Notes" page (teacher.html) to real Supabase Storage +
   the `notes` table, and lets Miss Rameen create chapters/sub-chapters
   herself (table `chapters`) instead of asking Claude to edit content.json.
   Runs as a module — see teacher-auth-guard.js for the script-order
   reasoning. Uploads go to whichever cohort is currently selected via the
   cohort pills (same `activeCohort` the rest of the dashboard already uses).

   Uploaded notes render as a searchable/filterable card grid (View PDF /
   Edit / Delete per card) instead of an ever-growing flat list — the list
   view made it impossible for her to find a specific note once she'd
   uploaded more than a handful. Student-facing Notes/Vault are untouched;
   this is admin-only. */

import { supabase } from "./supabase-config.js";
import { loadChapters, topLevelChapters, subChaptersOf, createChapter } from "./chapters-data.js";

const $ = (id) => document.getElementById(id);

let allNotes = [];
let editingNoteId = null;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function populateSubjects() {
  $("unSubject").innerHTML = SUBJECTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  $("unEditSubject").innerHTML = $("unSubject").innerHTML;
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

function populateEditChapterDropdown() {
  const chapters = topLevelChapters($("unEditSubject").value);
  $("unEditChapter").innerHTML = chapters.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
  populateEditSubChapterDropdown();
}

function populateEditSubChapterDropdown() {
  const chapterId = $("unEditChapter").value;
  const subs = chapterId ? subChaptersOf(chapterId) : [];
  const sel = $("unEditSubChapter");
  sel.innerHTML = subs.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
  sel.hidden = !subs.length;
}

function chapterLabel(chapterId) {
  const c = CHAPTERS.find((x) => x.id === chapterId);
  return c ? c.title : chapterId;
}

/* Given a chapter/sub-chapter id, selects the right subject/chapter/
   sub-chapter combo in the Edit modal's dropdowns. */
function selectEditChapter(subjectId, chapterId) {
  $("unEditSubject").value = subjectId;
  populateEditChapterDropdown();

  const chapter = CHAPTERS.find((c) => c.id === chapterId);
  if (chapter && chapter.parentId) {
    $("unEditChapter").value = chapter.parentId;
    populateEditSubChapterDropdown();
    $("unEditSubChapter").value = chapterId;
  } else {
    $("unEditChapter").value = chapterId;
    populateEditSubChapterDropdown();
  }
}

function noteCardHTML(n) {
  return `
    <div class="res-card">
      <div class="res-card-top">
        <span class="res-tag">${esc(subjectName(n.subject))}</span>
        <span class="res-kind">${ICONS.pdf}</span>
      </div>
      <strong class="res-title">${esc(n.title)}</strong>
      <span class="res-chapter">${esc(chapterLabel(n.chapter_id))}</span>
      ${n.description ? `<p class="res-desc">${esc(n.description)}</p>` : ""}
      <span class="res-meta">Uploaded ${fmtDate(n.created_at)}</span>
      <div class="res-actions">
        <button type="button" class="btn btn-outline btn-sm" data-view-note="${n.id}">${ICONS.eye} View</button>
        <button type="button" class="btn btn-outline btn-sm" data-edit-note="${n.id}">${ICONS.edit} Edit</button>
        <button type="button" class="btn-icon-danger" data-delete-note="${n.id}" data-delete-path="${esc(n.storage_path)}" data-delete-title="${esc(n.title)}" aria-label="Delete ${esc(n.title)}">${ICONS.trash}</button>
      </div>
    </div>`;
}

/* Newest-first list of what's been uploaded to this cohort, filtered by
   the search box. Organising (moving between topics, renaming topics,
   merging duplicates) lives on the Manage Content page — this panel is
   just "upload something, confirm it landed". */
function renderGrid() {
  const list = document.querySelector('[data-list="notes-uploads"]');
  const empty = $("notesUploadsEmpty");
  const q = $("notesSearch").value.trim().toLowerCase();

  if (!allNotes.length) {
    list.innerHTML = "";
    $("notesResCount").textContent = "";
    empty.textContent = "No notes uploaded yet for this cohort.";
    empty.hidden = false;
    return;
  }

  const shown = q
    ? allNotes.filter((n) =>
        `${n.title} ${n.description || ""} ${subjectName(n.subject)} ${chapterLabel(n.chapter_id)}`
          .toLowerCase()
          .includes(q)
      )
    : allNotes;

  $("notesResCount").textContent = q
    ? `${shown.length} of ${allNotes.length} notes`
    : `${allNotes.length} note${allNotes.length === 1 ? "" : "s"}`;

  if (!shown.length) {
    list.innerHTML = "";
    empty.textContent = "No notes match your search.";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = `<div class="res-grid">${shown.map(noteCardHTML).join("")}</div>`;
}

async function renderNotesUploadHistory() {
  $("unCohortTag").textContent = COHORT_DATA[activeCohort].name;

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("created_at", { ascending: false });

  if (error) {
    allNotes = [];
    const grid = document.querySelector('[data-list="notes-uploads"]');
    const empty = $("notesUploadsEmpty");
    grid.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load uploads: ${error.message}`;
    return;
  }

  allNotes = data;
  renderGrid();
}

document.querySelector('[data-list="notes-uploads"]').addEventListener("click", async (e) => {
  const viewBtn = e.target.closest("[data-view-note]");
  if (viewBtn) {
    const note = allNotes.find((n) => n.id === viewBtn.dataset.viewNote);
    if (!note) return;
    viewBtn.disabled = true;
    const { data, error } = await supabase.storage.from("notes").createSignedUrl(note.storage_path, 60);
    viewBtn.disabled = false;
    if (error || !data) {
      showToast("Couldn't open PDF", "Please try again in a moment.");
      return;
    }
    window.open(data.signedUrl, "_blank");
    return;
  }

  const editBtn = e.target.closest("[data-edit-note]");
  if (editBtn) {
    openEditModal(editBtn.dataset.editNote);
    return;
  }

  const delBtn = e.target.closest("[data-delete-note]");
  if (!delBtn) return;

  const noteId = delBtn.dataset.deleteNote;
  const path = delBtn.dataset.deletePath;
  const title = delBtn.dataset.deleteTitle;
  if (!confirm(`Delete "${title}"? Students will no longer see it. This can't be undone.`)) return;

  delBtn.disabled = true;
  try {
    const { error: deleteError } = await supabase.from("notes").delete().eq("id", noteId);
    if (deleteError) throw deleteError;
    if (path) await supabase.storage.from("notes").remove([path]);

    await renderNotesUploadHistory();
    showToast("Note deleted", `${title} was removed.`);
  } catch (err) {
    delBtn.disabled = false;
    showToast("Couldn't delete", err.message || "Please try again.");
  }
});

$("notesSearch").addEventListener("input", renderGrid);

/* ============================= Edit modal ============================= */

function openEditModal(noteId) {
  const note = allNotes.find((n) => n.id === noteId);
  if (!note) return;
  editingNoteId = noteId;

  selectEditChapter(note.subject, note.chapter_id);
  $("unEditTitle").value = note.title;
  $("unEditDescription").value = note.description || "";
  $("unEditFile").value = "";
  $("unEditError").hidden = true;
  $("noteEditModal").hidden = false;
}

function closeEditModal() {
  $("noteEditModal").hidden = true;
  editingNoteId = null;
}

$("noteEditModal").addEventListener("click", (e) => {
  if (e.target === $("noteEditModal") || e.target.closest("[data-modal-close]")) closeEditModal();
});

$("unEditSubject").addEventListener("change", populateEditChapterDropdown);
$("unEditChapter").addEventListener("change", populateEditSubChapterDropdown);

$("noteEditForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingNoteId) return;
  $("unEditError").hidden = true;

  const note = allNotes.find((n) => n.id === editingNoteId);
  const subjectId = $("unEditSubject").value;
  const chapterId = $("unEditSubChapter").hidden ? $("unEditChapter").value : $("unEditSubChapter").value;
  const title = $("unEditTitle").value.trim();
  const description = $("unEditDescription").value.trim();
  const file = $("unEditFile").files[0];

  if (file && file.type !== "application/pdf") {
    $("unEditError").textContent = "Only PDF files are supported right now.";
    $("unEditError").hidden = false;
    return;
  }

  const btn = $("unEditSubmitBtn");
  btn.disabled = true;
  try {
    const updates = { subject: subjectId, chapter_id: chapterId, title, description: description || null };

    if (file) {
      const newPath = `${activeCohort}/${subjectId}/${chapterId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("notes").upload(newPath, file);
      if (uploadError) throw uploadError;
      updates.storage_path = newPath;
      updates.size_bytes = file.size;
    }

    const { error: updateError } = await supabase.from("notes").update(updates).eq("id", editingNoteId);
    if (updateError) throw updateError;

    if (file && note.storage_path) await supabase.storage.from("notes").remove([note.storage_path]);

    closeEditModal();
    await renderNotesUploadHistory();
    showToast("Note updated", `${title} was saved.`);
  } catch (err) {
    $("unEditError").textContent = err.message || "Couldn't save changes — please try again.";
    $("unEditError").hidden = false;
  } finally {
    btn.disabled = false;
  }
});

/* ============================ Upload flow ============================= */

window.dataReadyPromise.then(async () => {
  populateSubjects();
  await loadChapters(activeCohort);
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
    const created = await createChapter(subjectId, title.trim(), null, activeCohort);
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
    const created = await createChapter($("unSubject").value, title.trim(), chapterId, activeCohort);
    populateSubChapterDropdown();
    $("unSubChapter").value = created.id;
    showToast("Sub-chapter created", `"${title.trim()}" added inside ${chapterLabel(chapterId)}.`);
  } catch (err) {
    showToast("Couldn't create sub-chapter", err.message || "Please try again.");
  }
});

// Chapters are cohort-scoped now, so a pill switch has to reload the tree
// before the chapter dropdowns (and the history's chapter labels) can be right.
document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", async () => {
    await loadChapters(activeCohort);
    populateChapterDropdown();
    await renderNotesUploadHistory();
  })
);

$("uploadNoteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("unError").hidden = true;

  const subjectId = $("unSubject").value;
  const chapterId = $("unChapter").value;
  const subChapterId = $("unSubChapter").hidden ? null : $("unSubChapter").value;
  const finalChapterId = subChapterId || chapterId;
  const title = $("unTitle").value.trim();
  const description = $("unDescription").value.trim();
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
      description: description || null,
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
