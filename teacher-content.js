/* Manage Content (teacher.html) — the single place the whole content tree
   is organised. Built 2026-08-16, replacing the "Manage Chapters" modal
   that grew piecemeal on top of the Upload Notes / Video Lectures panels:
   that version spanned every cohort at once (chapters had no cohort_id),
   which is how a lecture posted under May/June could inflate an
   October/November topic's count and look like a bug.

   Everything here is cohort-scoped — chapters now carry cohort_id (see
   cohort-scoped-chapters.sql), so each cohort owns an independent tree and
   renaming or deleting a topic in one never touches the other. Uploading
   still lives on Upload Notes; this page only reorganises what exists.

   Runs as a module — see teacher-auth-guard.js for the script-order
   reasoning. */

import { supabase } from "./supabase-config.js";
import {
  loadChapters, topLevelChapters, subChaptersOf, createChapter,
  renameChapter, moveChapter, mergeChapter, deleteChapter,
} from "./chapters-data.js";

const $ = (id) => document.getElementById(id);

const KIND = {
  lecture: { table: "lectures", label: "lecture", icon: () => ICONS.video },
  note: { table: "notes", label: "note", icon: () => ICONS.pdf },
};

let kind = "lecture";
let subject = null;
let items = [];
let occupancy = {};
const open = new Set();

/* ------------------------------------------------------------- loading */

async function loadItems() {
  const cols = kind === "note"
    ? "id, title, chapter_id, subject, storage_path"
    : "id, title, chapter_id, subject";

  // The active tab's rows drive the expanded lists and per-item actions, but
  // occupancy has to span BOTH tables: a topic with no lectures can still
  // hold notes, and deleting it would be rejected by the notes foreign key.
  const [active, lectureRows, noteRows] = await Promise.all([
    supabase.from(KIND[kind].table).select(cols)
      .eq("cohort_id", activeCohort).order("created_at", { ascending: false }),
    supabase.from("lectures").select("chapter_id").eq("cohort_id", activeCohort),
    supabase.from("notes").select("chapter_id").eq("cohort_id", activeCohort),
  ]);

  items = active.error ? [] : (active.data || []);

  occupancy = {};
  const tally = (rows, key) => (rows || []).forEach((r) => {
    if (!occupancy[r.chapter_id]) occupancy[r.chapter_id] = { lecture: 0, note: 0 };
    occupancy[r.chapter_id][key] += 1;
  });
  tally(lectureRows.data, "lecture");
  tally(noteRows.data, "note");
}

async function refresh() {
  await Promise.all([loadChapters(activeCohort), loadItems()]);
  render();
}

/* ------------------------------------------------------------ counting */

function itemsIn(chapterId) {
  return items.filter((i) => i.chapter_id === chapterId);
}

function occ(chapterId) {
  return occupancy[chapterId] || { lecture: 0, note: 0 };
}

// Everything filed under a chapter — both kinds, and its sub-topics when it
// has them. This is what decides whether Delete is allowed, rather than the
// count the current tab happens to show.
function occupiedCount(chapter, withSubs) {
  const chapters = withSubs ? [chapter, ...subChaptersOf(chapter.id)] : [chapter];
  return chapters.reduce((sum, c) => {
    const o = occ(c.id);
    return sum + o.lecture + o.note;
  }, 0);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------ rendering */

const ICON_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';
const ICON_PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const ICON_MOVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 5 7h3v7h2V7h3L9 3zm6 14v-7h-2v7h-3l4 4 4-4h-3z"/></svg>';
const ICON_MERGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 20.41 18.41 19 15 15.59 13.59 17 17 20.41zM7.5 8H11v5.59L5.59 19 7 20.41l6-6V8h3.5L12 3.5 7.5 8z"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';

function actionBtn(icon, action, id, label, disabledReason) {
  const off = disabledReason ? ` disabled title="${esc(disabledReason)}"` : "";
  return `<button type="button" class="mc-ico${action === "delete" ? " danger" : ""}" data-act="${action}" data-id="${id}" aria-label="${esc(label)}"${off}>${icon}</button>`;
}

function chapterRow(c, isSub, index) {
  const subs = isSub ? [] : subChaptersOf(c.id);
  const isOpen = open.has(c.id);
  const o = occ(c.id);

  // Delete is blocked by anything filed under it in EITHER table, not just
  // the tab being viewed — the database rejects it either way.
  const blocking = occupiedCount(c, !isSub);
  const blockedReason = blocking
    ? `Still holds ${plural(blocking, "item")} — move or merge them first`
    : "";

  // The other kind is only mentioned when it's there, so a topic that's
  // empty on this tab but full on the other never looks deletable.
  const meta = [plural(kind === "note" ? o.note : o.lecture, KIND[kind].label)];
  const other = kind === "note" ? o.lecture : o.note;
  if (other) meta.push(plural(other, kind === "note" ? "lecture" : "note"));
  if (!isSub && subs.length) meta.push(plural(subs.length, "sub-topic"));

  return `
    <div class="mc-row${isSub ? " sub" : ""}" data-chapter="${c.id}">
      <button type="button" class="mc-chev${isOpen ? " open" : ""}" data-act="toggle" data-id="${c.id}" aria-label="Expand ${esc(c.title)}">${ICON_CHEV}</button>
      ${isSub ? "" : `<span class="mc-idx">${String(index).padStart(2, "0")}</span>`}
      <span class="mc-label">
        <span class="mc-title">${esc(c.title)}</span>
        <span class="mc-meta">${meta.join(" · ")}</span>
      </span>
      <span class="mc-acts">
        ${actionBtn(ICON_PENCIL, "rename", c.id, `Rename ${c.title}`)}
        ${actionBtn(ICON_MOVE, "move-chapter", c.id, `Move ${c.title}`)}
        ${actionBtn(ICON_MERGE, "merge-chapter", c.id, `Merge ${c.title}`)}
        ${actionBtn(ICONS.trash, "delete-chapter", c.id, `Delete ${c.title}`, blockedReason)}
      </span>
    </div>`;
}

function itemRow(item) {
  return `
    <div class="mc-item" data-item="${item.id}">
      <span class="mc-item-icon">${KIND[kind].icon()}</span>
      <span class="mc-item-title">${esc(item.title)}</span>
      <span class="mc-acts">
        ${actionBtn(ICON_MOVE, "move-item", item.id, `Move ${item.title}`)}
        ${actionBtn(ICONS.trash, "delete-item", item.id, `Delete ${item.title}`)}
      </span>
    </div>`;
}

function itemsBlock(chapterId) {
  const list = itemsIn(chapterId);
  if (!open.has(chapterId)) return "";
  if (!list.length) {
    return `<div class="mc-items"><p class="mc-none">Nothing filed directly here.</p></div>`;
  }
  return `<div class="mc-items">${list.map(itemRow).join("")}</div>`;
}

function renderSubjects() {
  $("mcSubjects").innerHTML = SUBJECTS.map((s) => {
    const n = items.filter((i) => i.subject === s.id).length;
    return `<button type="button" class="mc-subj${s.id === subject ? " active" : ""}" data-subject="${s.id}">
      ${esc(s.name)} <em>${n}</em>
    </button>`;
  }).join("");
}

function render() {
  $("mcHint").textContent = `${COHORT_DATA[activeCohort].name} · topics and content are separate per cohort`;
  if (!subject && SUBJECTS.length) subject = SUBJECTS[0].id;

  renderSubjects();

  const tops = topLevelChapters(subject);
  const tree = $("mcTree");

  const addTopic = `
    <button type="button" class="mc-add" data-act="add-topic">
      ${ICON_PLUS} Add topic to ${esc(subjectName(subject))}
    </button>`;

  if (!tops.length) {
    tree.innerHTML = `<p class="empty-note">No topics yet for ${esc(subjectName(subject))} in this cohort.</p>${addTopic}`;
    return;
  }

  tree.innerHTML = tops.map((t, i) => {
    const subs = subChaptersOf(t.id);
    return chapterRow(t, false, i + 1)
      + itemsBlock(t.id)
      + subs.map((s) => chapterRow(s, true) + itemsBlock(s.id)).join("")
      + `<button type="button" class="mc-add sub" data-act="add-sub" data-id="${t.id}">${ICON_PLUS} Add sub-topic to ${esc(t.title)}</button>`;
  }).join("") + addTopic;
}

/* -------------------------------------------------------------- picking */

// Small inline chooser reusing the modal component, rather than a <select>
// per row — the old manager put three dropdowns on every row and she said
// it was getting confusing.
function choose(title, options) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card mc-choose">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button type="button" class="modal-close" data-close aria-label="Close">&times;</button>
        </div>
        <div class="mc-choose-list">
          ${options.map((o) => `<button type="button" class="mc-choose-row" data-value="${o.value}">
            <span>${esc(o.label)}</span>${o.hint ? `<small>${esc(o.hint)}</small>` : ""}
          </button>`).join("")}
        </div>
      </div>`;

    const done = (val) => { overlay.remove(); resolve(val); };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-close]")) return done(null);
      const row = e.target.closest("[data-value]");
      if (row) done(row.dataset.value);
    });
    document.body.appendChild(overlay);
  });
}

/* -------------------------------------------------------------- actions */

async function onRename(id) {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) return;
  const next = prompt("Rename to:", c.title);
  if (!next || !next.trim() || next.trim() === c.title) return;
  try {
    await renameChapter(id, next.trim());
    showToast("Renamed", `Now "${next.trim()}".`);
    render();
  } catch (err) {
    showToast("Couldn't rename", err.message || "Please try again.");
  }
}

async function onMoveChapter(id) {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) return;

  const options = [];
  if (c.parentId) options.push({ value: "__top__", label: "Top level", hint: "make it a topic" });

  // Only a chapter with no sub-topics of its own can become a sub-topic —
  // otherwise the tree would go three levels deep, which nothing renders.
  const canNest = c.parentId || subChaptersOf(c.id).length === 0;
  if (canNest) {
    topLevelChapters(subject)
      .filter((t) => t.id !== c.id && t.id !== c.parentId)
      .forEach((t) => options.push({ value: t.id, label: t.title, hint: "as a sub-topic" }));
  }

  if (!options.length) {
    showToast("Nowhere to move it", "This topic has sub-topics of its own, so it can't be nested.");
    return;
  }

  const pick = await choose(`Move "${c.title}" to`, options);
  if (!pick) return;
  try {
    await moveChapter(id, pick === "__top__" ? null : pick);
    showToast("Moved", `"${c.title}" was refiled.`);
    await refresh();
  } catch (err) {
    showToast("Couldn't move", err.message || "Please try again.");
  }
}

async function onMergeChapter(id) {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) return;

  // A topic keeps its sub-topics through a merge, so it can only merge into
  // another topic; a sub-topic (never has children) can go anywhere.
  const candidates = c.parentId
    ? CHAPTERS.filter((x) => x.subject === subject && x.id !== c.id)
    : topLevelChapters(subject).filter((t) => t.id !== c.id);

  if (!candidates.length) {
    showToast("Nothing to merge into", "There's no other topic in this subject.");
    return;
  }

  const pick = await choose(
    `Merge "${c.title}" into`,
    candidates.map((x) => ({ value: x.id, label: x.title, hint: x.parentId ? "sub-topic" : "topic" }))
  );
  if (!pick) return;

  const target = CHAPTERS.find((x) => x.id === pick);
  if (!confirm(`Move everything from "${c.title}" into "${target.title}", then delete "${c.title}"? This can't be undone.`)) return;

  try {
    await mergeChapter(id, pick);
    showToast("Merged", `Everything is now under "${target.title}".`);
    await refresh();
  } catch (err) {
    showToast("Couldn't merge", err.message || "Please try again.");
  }
}

async function onDeleteChapter(id) {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
  try {
    await deleteChapter(id);
    showToast("Deleted", `"${c.title}" was removed.`);
    await refresh();
  } catch (err) {
    // The raw Postgres foreign-key message is unreadable, and this is the
    // only way it can realistically fail, so say what it actually means.
    const fk = /foreign key|violates/i.test(err.message || "");
    showToast(
      "Couldn't delete",
      fk
        ? "Something is still filed under it — check the Notes tab as well as Lectures."
        : err.message || "Please try again."
    );
    await refresh();
  }
}

async function onAddTopic() {
  const title = prompt(`New topic in ${subjectName(subject)}:`);
  if (!title || !title.trim()) return;
  try {
    await createChapter(subject, title.trim(), null, activeCohort);
    showToast("Topic added", `"${title.trim()}" is ready to use.`);
    render();
  } catch (err) {
    showToast("Couldn't add topic", err.message || "Please try again.");
  }
}

async function onAddSub(parentId) {
  const parent = CHAPTERS.find((x) => x.id === parentId);
  const title = prompt(`New sub-topic inside "${parent ? parent.title : ""}":`);
  if (!title || !title.trim()) return;
  try {
    await createChapter(subject, title.trim(), parentId, activeCohort);
    open.add(parentId);
    showToast("Sub-topic added", `"${title.trim()}" is ready to use.`);
    render();
  } catch (err) {
    showToast("Couldn't add sub-topic", err.message || "Please try again.");
  }
}

async function onMoveItem(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;

  const options = CHAPTERS
    .filter((c) => c.subject === subject && c.id !== item.chapter_id)
    .map((c) => ({ value: c.id, label: c.title, hint: c.parentId ? "sub-topic" : "topic" }));

  if (!options.length) {
    showToast("Nowhere to move it", "Add another topic first.");
    return;
  }

  const pick = await choose(`Move "${item.title}" to`, options);
  if (!pick) return;

  try {
    const { error } = await supabase.from(KIND[kind].table).update({ chapter_id: pick }).eq("id", id);
    if (error) throw error;
    open.add(pick);
    showToast("Moved", `"${item.title}" was refiled.`);
    await refresh();
  } catch (err) {
    showToast("Couldn't move", err.message || "Please try again.");
  }
}

async function onDeleteItem(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (!confirm(`Delete "${item.title}"? Students will no longer see it. This can't be undone.`)) return;

  try {
    const { error } = await supabase.from(KIND[kind].table).delete().eq("id", id);
    if (error) throw error;
    if (kind === "note" && item.storage_path) {
      await supabase.storage.from("notes").remove([item.storage_path]);
    }
    showToast("Deleted", `"${item.title}" was removed.`);
    await refresh();
  } catch (err) {
    showToast("Couldn't delete", err.message || "Please try again.");
  }
}

/* ------------------------------------------------------------- wiring */

$("mcTree").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.disabled) return;
  const id = btn.dataset.id;

  switch (btn.dataset.act) {
    case "toggle":
      if (open.has(id)) open.delete(id);
      else open.add(id);
      render();
      break;
    case "rename": onRename(id); break;
    case "move-chapter": onMoveChapter(id); break;
    case "merge-chapter": onMergeChapter(id); break;
    case "delete-chapter": onDeleteChapter(id); break;
    case "move-item": onMoveItem(id); break;
    case "delete-item": onDeleteItem(id); break;
    case "add-topic": onAddTopic(); break;
    case "add-sub": onAddSub(id); break;
  }
});

$("mcSubjects").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-subject]");
  if (!btn) return;
  subject = btn.dataset.subject;
  open.clear();
  render();
});

document.querySelectorAll(".mc-tab").forEach((tab) =>
  tab.addEventListener("click", async () => {
    if (tab.dataset.mcKind === kind) return;
    kind = tab.dataset.mcKind;
    document.querySelectorAll(".mc-tab").forEach((t) => t.classList.toggle("active", t === tab));
    open.clear();
    await refresh();
  })
);

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    open.clear();
    subject = null;
    if (!$("mcTree").closest(".view").hidden) refresh();
  })
);

document.addEventListener("swr-view", (e) => {
  if (e.detail === "content") refresh();
});
