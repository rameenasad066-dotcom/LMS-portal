/* Chapter Manager (teacher.html, "Manage Chapters" button on Upload Notes).
   Lets Rameen rename, merge, move, and delete chapters/sub-chapters herself
   instead of asking for it every time — built 2026-08-16 after a duplicate
   "pillars of islam" / "The Pillars of Islam" chapter appeared from the
   freeform "+Add chapter" prompt() with no duplicate check. Chapters are
   NOT cohort-scoped (see chapters.sql — no cohort_id column), so every
   action here affects every cohort's notes/lectures that reference the
   chapter, not just the active one. Runs as a module — see
   teacher-auth-guard.js for the script-order reasoning. */

import { supabase } from "./supabase-config.js";
import {
  loadChapters, topLevelChapters, subChaptersOf,
  renameChapter, moveChapter, mergeChapter, deleteChapter,
} from "./chapters-data.js";

const $ = (id) => document.getElementById(id);

// { chapterId: count } — notes + lectures filed directly under that
// chapter, counted across ALL cohorts since chapters are shared.
let itemCounts = {};

async function loadCounts() {
  const [{ data: notes }, { data: lectures }] = await Promise.all([
    supabase.from("notes").select("chapter_id"),
    supabase.from("lectures").select("chapter_id"),
  ]);
  itemCounts = {};
  (notes || []).forEach((n) => { itemCounts[n.chapter_id] = (itemCounts[n.chapter_id] || 0) + 1; });
  (lectures || []).forEach((l) => { itemCounts[l.chapter_id] = (itemCounts[l.chapter_id] || 0) + 1; });
}

function populateSubjectSelect() {
  $("chapterMgrSubject").innerHTML = SUBJECTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
}

function chapterRowHTML(c, isSub) {
  const count = itemCounts[c.id] || 0;
  const subs = isSub ? [] : subChaptersOf(c.id);
  const subCount = subs.reduce((sum, s) => sum + (itemCounts[s.id] || 0), 0);
  const totalCount = count + subCount;
  const canDelete = totalCount === 0;

  return `
    <div class="chapter-mgr-row${isSub ? " sub" : ""}" data-chapter-id="${c.id}">
      <div class="chapter-mgr-row-main">
        <span class="chapter-mgr-title" data-title>${esc(c.title)}</span>
        <span class="chapter-mgr-count">${count} item${count === 1 ? "" : "s"}${!isSub && subs.length ? ` · ${subs.length} sub-chapter${subs.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      <div class="chapter-mgr-actions">
        <button type="button" class="btn btn-outline btn-sm" data-rename="${c.id}">Rename</button>
        <select class="tool-select chapter-mgr-select" data-move="${c.id}">
          <option value="">Move to…</option>
        </select>
        <select class="tool-select chapter-mgr-select" data-merge="${c.id}">
          <option value="">Merge into…</option>
        </select>
        <button type="button" class="btn-icon-danger" data-delete="${c.id}" data-delete-title="${esc(c.title)}" ${canDelete ? "" : "disabled title=\"Merge or move its content first\""} aria-label="Delete ${esc(c.title)}">${ICONS.trash}</button>
      </div>
    </div>`;
}

function render() {
  const subjectId = $("chapterMgrSubject").value;
  const tops = topLevelChapters(subjectId);
  const list = $("chapterMgrList");

  if (!tops.length) {
    list.innerHTML = '<p class="empty-note">No chapters yet for this subject.</p>';
    return;
  }

  list.innerHTML = tops.map((t) => {
    const subs = subChaptersOf(t.id);
    return chapterRowHTML(t, false) + subs.map((s) => chapterRowHTML(s, true)).join("");
  }).join("");

  // Fill each row's Move/Merge dropdowns now that the DOM exists.
  const allInSubject = CHAPTERS.filter((c) => c.subject === subjectId);
  list.querySelectorAll("[data-move]").forEach((sel) => {
    const chapter = allInSubject.find((c) => c.id === sel.dataset.move);
    if (!chapter) return;
    const options = ['<option value="">Move to…</option>'];
    if (chapter.parentId) options.push('<option value="__top__">Top level</option>');
    tops
      .filter((t) => t.id !== chapter.id && (!chapter.parentId || t.id !== chapter.parentId))
      // A top-level chapter can only become a sub-chapter if it has no
      // sub-chapters of its own — moving it under another chapter would
      // otherwise create a third level of nesting the UI doesn't support.
      .filter(() => chapter.parentId || subChaptersOf(chapter.id).length === 0)
      .forEach((t) => options.push(`<option value="${t.id}">${esc(t.title)}</option>`));
    sel.innerHTML = options.join("");
  });

  list.querySelectorAll("[data-merge]").forEach((sel) => {
    const chapter = allInSubject.find((c) => c.id === sel.dataset.merge);
    if (!chapter) return;
    const options = ['<option value="">Merge into…</option>'];
    // Merging a top-level chapter (which may have sub-chapters of its own)
    // is only offered into other top-level chapters, so the merge target's
    // depth never exceeds 2 levels. A sub-chapter (never has children) can
    // merge into anything else in the subject.
    const candidates = chapter.parentId
      ? allInSubject.filter((c) => c.id !== chapter.id)
      : tops.filter((t) => t.id !== chapter.id);
    candidates.forEach((c) => options.push(`<option value="${c.id}">${esc(c.title)}${c.parentId ? " (sub)" : ""}</option>`));
    sel.innerHTML = options.join("");
  });
}

async function refresh() {
  await Promise.all([loadChapters(), loadCounts()]);
  render();
}

function openModal() {
  $("chapterManagerModal").hidden = false;
  refresh();
}

function closeModal() {
  $("chapterManagerModal").hidden = true;
}

$("openChapterManagerBtn").addEventListener("click", openModal);
$("chapterMgrClose").addEventListener("click", closeModal);
$("chapterManagerModal").addEventListener("click", (e) => {
  if (e.target === $("chapterManagerModal")) closeModal();
});
$("chapterMgrSubject").addEventListener("change", render);

$("chapterMgrList").addEventListener("click", async (e) => {
  const renameBtn = e.target.closest("[data-rename]");
  if (renameBtn) {
    const row = renameBtn.closest("[data-chapter-id]");
    const current = row.querySelector("[data-title]").textContent;
    const newTitle = prompt("Rename chapter:", current);
    if (!newTitle || !newTitle.trim() || newTitle.trim() === current) return;
    try {
      await renameChapter(renameBtn.dataset.rename, newTitle.trim());
      showToast("Chapter renamed", `Now "${newTitle.trim()}".`);
      render();
    } catch (err) {
      showToast("Couldn't rename", err.message || "Please try again.");
    }
    return;
  }

  const deleteBtn = e.target.closest("[data-delete]");
  if (deleteBtn) {
    if (deleteBtn.disabled) return;
    const title = deleteBtn.dataset.deleteTitle;
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await deleteChapter(deleteBtn.dataset.delete);
      showToast("Chapter deleted", `"${title}" was removed.`);
      await refresh();
    } catch (err) {
      showToast("Couldn't delete", err.message || "It may still have content referencing it.");
    }
    return;
  }
});

$("chapterMgrList").addEventListener("change", async (e) => {
  const moveSelect = e.target.closest("[data-move]");
  if (moveSelect && moveSelect.value) {
    const chapterId = moveSelect.dataset.move;
    const target = moveSelect.value === "__top__" ? null : moveSelect.value;
    try {
      await moveChapter(chapterId, target);
      showToast("Chapter moved", "It's now filed under a new parent.");
      await refresh();
    } catch (err) {
      showToast("Couldn't move", err.message || "Please try again.");
      moveSelect.value = "";
    }
    return;
  }

  const mergeSelect = e.target.closest("[data-merge]");
  if (mergeSelect && mergeSelect.value) {
    const chapterId = mergeSelect.dataset.merge;
    const targetId = mergeSelect.value;
    const targetName = mergeSelect.selectedOptions[0].textContent;
    if (!confirm(`Merge this chapter into "${targetName}"? All its notes and lectures move over, and the empty chapter is deleted. This can't be undone.`)) {
      mergeSelect.value = "";
      return;
    }
    try {
      await mergeChapter(chapterId, targetId);
      showToast("Chapters merged", `Everything is now under "${targetName}".`);
      await refresh();
    } catch (err) {
      showToast("Couldn't merge", err.message || "Please try again.");
      mergeSelect.value = "";
    }
  }
});

window.dataReadyPromise.then(populateSubjectSelect);
