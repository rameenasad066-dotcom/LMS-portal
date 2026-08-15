/* Chapter Manager (teacher.html, "Manage Chapters" button on both the
   Upload Notes and Video Lectures panels). Lets Rameen rename, merge,
   move, and delete chapters/sub-chapters — and now individual notes/
   lectures too — herself instead of asking for it every time. Built
   2026-08-16 after a duplicate "pillars of islam" / "The Pillars of
   Islam" chapter appeared from the freeform "+Add chapter" prompt() with
   no duplicate check; item-level moving added the same day so a
   wrongly-filed lecture/note can be relocated without going through each
   one's own Edit modal. Chapters are NOT cohort-scoped (see chapters.sql —
   no cohort_id column), so every action here affects every cohort's
   notes/lectures that reference the chapter, not just the active one.
   Runs as a module — see teacher-auth-guard.js for the script-order
   reasoning. */

import { supabase } from "./supabase-config.js";
import {
  loadChapters, topLevelChapters, subChaptersOf,
  renameChapter, moveChapter, mergeChapter, deleteChapter,
} from "./chapters-data.js";

const $ = (id) => document.getElementById(id);

// Every note + lecture, tagged with its type so a single move handler can
// update the right table. Loaded across ALL cohorts since chapters are
// shared, not cohort-scoped.
let allItems = [];
const expanded = new Set();

async function loadItems() {
  const [{ data: notes }, { data: lectures }] = await Promise.all([
    supabase.from("notes").select("id, title, chapter_id, subject, storage_path"),
    supabase.from("lectures").select("id, title, chapter_id, subject"),
  ]);
  allItems = [
    ...(notes || []).map((n) => ({ ...n, type: "note" })),
    ...(lectures || []).map((l) => ({ ...l, type: "lecture" })),
  ];
}

function itemsForChapter(chapterId) {
  return allItems.filter((i) => i.chapter_id === chapterId);
}

function populateSubjectSelect() {
  $("chapterMgrSubject").innerHTML = SUBJECTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
}

function itemRowHTML(item) {
  const icon = item.type === "note" ? ICONS.pdf : ICONS.video;
  return `
    <div class="chapter-mgr-item" data-item-id="${item.id}" data-item-type="${item.type}">
      <span class="chapter-mgr-item-icon">${icon}</span>
      <span class="chapter-mgr-item-title">${esc(item.title)}</span>
      <select class="tool-select chapter-mgr-select" data-move-item="${item.id}" data-move-item-type="${item.type}">
        <option value="">Move to…</option>
      </select>
      <button type="button" class="btn-icon-danger" data-delete-item="${item.id}" data-delete-item-type="${item.type}" data-delete-item-path="${esc(item.storage_path || "")}" data-delete-item-title="${esc(item.title)}" aria-label="Delete ${esc(item.title)}">${ICONS.trash}</button>
    </div>`;
}

function chapterRowHTML(c, isSub) {
  const items = itemsForChapter(c.id);
  const count = items.length;
  const subs = isSub ? [] : subChaptersOf(c.id);
  const subCount = subs.reduce((sum, s) => sum + itemsForChapter(s.id).length, 0);
  const totalCount = count + subCount;
  const canDelete = totalCount === 0;
  const isOpen = expanded.has(c.id);

  return `
    <div class="chapter-mgr-row${isSub ? " sub" : ""}" data-chapter-id="${c.id}">
      <div class="chapter-mgr-row-main">
        <button type="button" class="chapter-mgr-toggle" data-toggle="${c.id}" ${count ? "" : "disabled"} aria-label="Show items">
          <svg viewBox="0 0 24 24" class="chapter-mgr-chev ${isOpen ? "open" : ""}"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
        </button>
        <span class="chapter-mgr-titlewrap">
          <span class="chapter-mgr-title" data-title>${esc(c.title)}</span>
          <span class="chapter-mgr-count">${count} item${count === 1 ? "" : "s"}${!isSub && subs.length ? ` · ${subs.length} sub-chapter${subs.length === 1 ? "" : "s"}` : ""}</span>
        </span>
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
    </div>
    ${isOpen && items.length ? `<div class="chapter-mgr-items">${items.map(itemRowHTML).join("")}</div>` : ""}`;
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

  const allInSubject = CHAPTERS.filter((c) => c.subject === subjectId);

  // Chapter-level Move to…
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

  // Chapter-level Merge into…
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

  // Item-level Move to… — any other chapter (top or sub) in the subject.
  // Items have no children, so there's no depth constraint to worry about.
  list.querySelectorAll("[data-move-item]").forEach((sel) => {
    const item = allItems.find((i) => i.id === sel.dataset.moveItem);
    if (!item) return;
    const options = ['<option value="">Move to…</option>'];
    allInSubject
      .filter((c) => c.id !== item.chapter_id)
      .forEach((c) => options.push(`<option value="${c.id}">${esc(c.title)}${c.parentId ? " (sub)" : ""}</option>`));
    sel.innerHTML = options.join("");
  });
}

async function refresh() {
  await Promise.all([loadChapters(), loadItems()]);
  render();
}

function openModal() {
  $("chapterManagerModal").hidden = false;
  refresh();
}

function closeModal() {
  $("chapterManagerModal").hidden = true;
}

document.querySelectorAll("[data-open-chapter-manager]").forEach((btn) =>
  btn.addEventListener("click", openModal)
);
$("chapterMgrClose").addEventListener("click", closeModal);
$("chapterManagerModal").addEventListener("click", (e) => {
  if (e.target === $("chapterManagerModal")) closeModal();
});
$("chapterMgrSubject").addEventListener("change", render);

$("chapterMgrList").addEventListener("click", async (e) => {
  const toggleBtn = e.target.closest("[data-toggle]");
  if (toggleBtn) {
    if (toggleBtn.disabled) return;
    const id = toggleBtn.dataset.toggle;
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    render();
    return;
  }

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

  const deleteItemBtn = e.target.closest("[data-delete-item]");
  if (deleteItemBtn) {
    const itemId = deleteItemBtn.dataset.deleteItem;
    const itemType = deleteItemBtn.dataset.deleteItemType;
    const path = deleteItemBtn.dataset.deleteItemPath;
    const title = deleteItemBtn.dataset.deleteItemTitle;
    if (!confirm(`Delete "${title}"? Students will no longer see it. This can't be undone.`)) return;

    deleteItemBtn.disabled = true;
    try {
      const table = itemType === "note" ? "notes" : "lectures";
      const { error } = await supabase.from(table).delete().eq("id", itemId);
      if (error) throw error;
      if (itemType === "note" && path) await supabase.storage.from("notes").remove([path]);

      showToast(itemType === "note" ? "Note deleted" : "Lecture deleted", `"${title}" was removed.`);
      await refresh();
    } catch (err) {
      deleteItemBtn.disabled = false;
      showToast("Couldn't delete", err.message || "Please try again.");
    }
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
    return;
  }

  const moveItemSelect = e.target.closest("[data-move-item]");
  if (moveItemSelect && moveItemSelect.value) {
    const itemId = moveItemSelect.dataset.moveItem;
    const itemType = moveItemSelect.dataset.moveItemType;
    const targetId = moveItemSelect.value;
    const table = itemType === "note" ? "notes" : "lectures";
    try {
      const { error } = await supabase.from(table).update({ chapter_id: targetId }).eq("id", itemId);
      if (error) throw error;
      showToast(itemType === "note" ? "Note moved" : "Lecture moved", "Filed under its new chapter.");
      await refresh();
    } catch (err) {
      showToast("Couldn't move", err.message || "Please try again.");
      moveItemSelect.value = "";
    }
  }
});

window.dataReadyPromise.then(populateSubjectSelect);
