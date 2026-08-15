/* Wires the "Add Video Lecture" panel (teacher.html, Upload Notes view) to
   real Supabase table `lectures`. No file upload — the video itself lives
   on Rameen's Google Drive (shared "Anyone with the link can view"), so
   this just stores the link + metadata, same shape/pattern as
   teacher-notes-upload.js's real notes flow (own subject/chapter/sub-
   chapter selects, deliberately separate elements from the Notes form so
   picking a subject for one doesn't affect the other). Runs as a module —
   see teacher-auth-guard.js for the script-order reasoning.

   Uploaded lectures render as the same searchable/filterable card grid as
   Notes (View / Edit / Delete per card) instead of an ever-growing flat
   list. Student-facing Lecture Vault is untouched; this is admin-only. */

import { supabase } from "./supabase-config.js";
import { loadChapters, topLevelChapters, subChaptersOf, createChapter } from "./chapters-data.js";

const $ = (id) => document.getElementById(id);

let allLectures = [];
let editingLectureId = null;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function populateSubjects() {
  $("lecSubject").innerHTML = SUBJECTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
  $("lecEditSubject").innerHTML = $("lecSubject").innerHTML;
}

function populateChapterDropdown() {
  const chapters = topLevelChapters($("lecSubject").value);
  $("lecChapter").innerHTML = chapters.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
  populateSubChapterDropdown();
}

function populateSubChapterDropdown() {
  const chapterId = $("lecChapter").value;
  const subs = chapterId ? subChaptersOf(chapterId) : [];
  const sel = $("lecSubChapter");
  const empty = $("lecNoSubChapters");

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
  const chapters = topLevelChapters($("lecEditSubject").value);
  $("lecEditChapter").innerHTML = chapters.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
  populateEditSubChapterDropdown();
}

function populateEditSubChapterDropdown() {
  const chapterId = $("lecEditChapter").value;
  const subs = chapterId ? subChaptersOf(chapterId) : [];
  const sel = $("lecEditSubChapter");
  sel.innerHTML = subs.map((c) => `<option value="${c.id}">${c.title}</option>`).join("");
  sel.hidden = !subs.length;
}

function chapterLabel(chapterId) {
  const c = CHAPTERS.find((x) => x.id === chapterId);
  return c ? c.title : chapterId;
}

function selectEditChapter(subjectId, chapterId) {
  $("lecEditSubject").value = subjectId;
  populateEditChapterDropdown();

  const chapter = CHAPTERS.find((c) => c.id === chapterId);
  if (chapter && chapter.parentId) {
    $("lecEditChapter").value = chapter.parentId;
    populateEditSubChapterDropdown();
    $("lecEditSubChapter").value = chapterId;
  } else {
    $("lecEditChapter").value = chapterId;
    populateEditSubChapterDropdown();
  }
}

/* Drill-down state: pick a subject, then a topic (top-level chapter),
   then see the lectures filed there — instead of one long flat grid. A
   search query bypasses the drill entirely and shows flat matches across
   every subject. */
const lecturesDrill = { subject: null, topic: null };

function lecturesMatching(q) {
  return allLectures.filter((l) => {
    const haystack = `${l.title} ${l.description || ""} ${subjectName(l.subject)} ${chapterLabel(l.chapter_id)}`.toLowerCase();
    return haystack.includes(q);
  });
}

/* A lecture's chapter_id may be a top-level chapter or one of its
   sub-chapters — "topic" always means the top-level one. */
function topicIdOf(chapterId) {
  const c = CHAPTERS.find((x) => x.id === chapterId);
  return c && c.parentId ? c.parentId : chapterId;
}

function lecturesForTopic(subjectId, topicId) {
  return allLectures.filter((l) => l.subject === subjectId && topicIdOf(l.chapter_id) === topicId);
}

function renderCrumbs() {
  const nav = $("lecturesCrumbs");
  const parts = [`<button type="button" class="res-crumb${lecturesDrill.subject ? "" : " current"}" data-crumb-root>All subjects</button>`];
  if (lecturesDrill.subject) {
    parts.push(`<span class="res-crumb-sep">/</span>`);
    parts.push(
      `<button type="button" class="res-crumb${lecturesDrill.topic ? "" : " current"}" data-crumb-subject>${esc(subjectName(lecturesDrill.subject))}</button>`
    );
  }
  if (lecturesDrill.topic) {
    parts.push(`<span class="res-crumb-sep">/</span>`);
    parts.push(`<span class="res-crumb current">${esc(chapterLabel(lecturesDrill.topic))}</span>`);
  }
  nav.innerHTML = parts.join("");
}

function lectureCardHTML(l) {
  return `
    <div class="res-card">
      <div class="res-card-top">
        <span class="res-tag">${esc(subjectName(l.subject))}</span>
        <span class="res-kind">${ICONS.video}</span>
      </div>
      <strong class="res-title">${esc(l.title)}</strong>
      <span class="res-chapter">${esc(chapterLabel(l.chapter_id))}${l.duration ? ` · ${esc(l.duration)}` : ""}</span>
      ${l.description ? `<p class="res-desc">${esc(l.description)}</p>` : ""}
      <span class="res-meta">Added ${fmtDate(l.created_at)}</span>
      <div class="res-actions">
        <button type="button" class="btn btn-outline btn-sm" data-view-lecture="${l.id}">${ICONS.eye} View</button>
        <button type="button" class="btn btn-outline btn-sm" data-edit-lecture="${l.id}">${ICONS.edit} Edit</button>
        <button type="button" class="btn-icon-danger" data-delete-lecture="${l.id}" data-delete-title="${esc(l.title)}" aria-label="Delete ${esc(l.title)}">${ICONS.trash}</button>
      </div>
    </div>`;
}

function renderGrid() {
  const list = document.querySelector('[data-list="lecture-uploads"]');
  const empty = $("lectureUploadsEmpty");
  const crumbs = $("lecturesCrumbs");
  const q = $("lecturesSearch").value.trim().toLowerCase();

  if (!allLectures.length) {
    crumbs.innerHTML = "";
    list.innerHTML = "";
    $("lecturesResCount").textContent = "";
    empty.textContent = "No lectures added yet for this cohort.";
    empty.hidden = false;
    return;
  }

  if (q) {
    crumbs.innerHTML = "";
    const matches = lecturesMatching(q);
    $("lecturesResCount").textContent = `${matches.length} match${matches.length === 1 ? "" : "es"}`;
    if (!matches.length) {
      list.innerHTML = "";
      empty.textContent = "No lectures match your search.";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = `<div class="res-grid">${matches.map(lectureCardHTML).join("")}</div>`;
    return;
  }

  empty.hidden = true;
  renderCrumbs();

  if (!lecturesDrill.subject) {
    $("lecturesResCount").textContent = "";
    list.innerHTML = `<div class="res-tile-grid">${SUBJECTS.map((s) => {
      const count = allLectures.filter((l) => l.subject === s.id).length;
      return `<button type="button" class="res-tile" data-drill-subject="${s.id}"><strong>${esc(s.name)}</strong><span class="res-tile-count">${count} lecture${count === 1 ? "" : "s"}</span></button>`;
    }).join("")}</div>`;
    return;
  }

  if (!lecturesDrill.topic) {
    $("lecturesResCount").textContent = "";
    const topics = topLevelChapters(lecturesDrill.subject);
    if (!topics.length) {
      list.innerHTML = "";
      empty.textContent = "No chapters yet for this subject — add one from the upload form.";
      empty.hidden = false;
      return;
    }
    list.innerHTML = `<div class="res-tile-grid">${topics.map((c) => {
      const count = lecturesForTopic(lecturesDrill.subject, c.id).length;
      return `<button type="button" class="res-tile" data-drill-topic="${c.id}"><strong>${esc(c.title)}</strong><span class="res-tile-count">${count} lecture${count === 1 ? "" : "s"}</span></button>`;
    }).join("")}</div>`;
    return;
  }

  const items = lecturesForTopic(lecturesDrill.subject, lecturesDrill.topic);
  $("lecturesResCount").textContent = `${items.length} lecture${items.length === 1 ? "" : "s"}`;
  if (!items.length) {
    list.innerHTML = "";
    empty.textContent = "No lectures added here yet.";
    empty.hidden = false;
    return;
  }
  list.innerHTML = `<div class="res-grid">${items.map(lectureCardHTML).join("")}</div>`;
}

$("lecturesCrumbs").addEventListener("click", (e) => {
  if (e.target.closest("[data-crumb-root]")) {
    lecturesDrill.subject = null;
    lecturesDrill.topic = null;
    renderGrid();
  } else if (e.target.closest("[data-crumb-subject]")) {
    lecturesDrill.topic = null;
    renderGrid();
  }
});

async function renderLectureHistory() {
  $("lecCohortTag").textContent = COHORT_DATA[activeCohort].name;

  const { data, error } = await supabase
    .from("lectures")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("created_at", { ascending: false });

  if (error) {
    allLectures = [];
    const grid = document.querySelector('[data-list="lecture-uploads"]');
    const empty = $("lectureUploadsEmpty");
    grid.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load lectures: ${error.message}`;
    return;
  }

  allLectures = data;
  renderGrid();
}

document.querySelector('[data-list="lecture-uploads"]').addEventListener("click", (e) => {
  const subjectTile = e.target.closest("[data-drill-subject]");
  if (subjectTile) {
    lecturesDrill.subject = subjectTile.dataset.drillSubject;
    renderGrid();
    return;
  }

  const topicTile = e.target.closest("[data-drill-topic]");
  if (topicTile) {
    lecturesDrill.topic = topicTile.dataset.drillTopic;
    renderGrid();
    return;
  }

  const viewBtn = e.target.closest("[data-view-lecture]");
  if (viewBtn) {
    const lecture = allLectures.find((l) => l.id === viewBtn.dataset.viewLecture);
    if (lecture) window.open(lecture.video_url, "_blank");
    return;
  }

  const editBtn = e.target.closest("[data-edit-lecture]");
  if (editBtn) {
    openEditModal(editBtn.dataset.editLecture);
    return;
  }

  const delBtn = e.target.closest("[data-delete-lecture]");
  if (!delBtn) return;

  const lectureId = delBtn.dataset.deleteLecture;
  const title = delBtn.dataset.deleteTitle;
  if (!confirm(`Delete "${title}"? Students will no longer see it. This can't be undone.`)) return;

  delBtn.disabled = true;
  (async () => {
    try {
      const { error } = await supabase.from("lectures").delete().eq("id", lectureId);
      if (error) throw error;

      await renderLectureHistory();
      showToast("Lecture deleted", `${title} was removed.`);
    } catch (err) {
      delBtn.disabled = false;
      showToast("Couldn't delete", err.message || "Please try again.");
    }
  })();
});

$("lecturesSearch").addEventListener("input", renderGrid);

/* ============================= Edit modal ============================= */

function openEditModal(lectureId) {
  const lecture = allLectures.find((l) => l.id === lectureId);
  if (!lecture) return;
  editingLectureId = lectureId;

  selectEditChapter(lecture.subject, lecture.chapter_id);
  $("lecEditTitle").value = lecture.title;
  $("lecEditUrl").value = lecture.video_url;
  $("lecEditDuration").value = lecture.duration || "";
  $("lecEditDescription").value = lecture.description || "";
  $("lecEditError").hidden = true;
  $("lectureEditModal").hidden = false;
}

function closeEditModal() {
  $("lectureEditModal").hidden = true;
  editingLectureId = null;
}

$("lectureEditModal").addEventListener("click", (e) => {
  if (e.target === $("lectureEditModal") || e.target.closest("[data-modal-close]")) closeEditModal();
});

$("lecEditSubject").addEventListener("change", populateEditChapterDropdown);
$("lecEditChapter").addEventListener("change", populateEditSubChapterDropdown);

$("lectureEditForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingLectureId) return;
  $("lecEditError").hidden = true;

  const subjectId = $("lecEditSubject").value;
  const chapterId = $("lecEditSubChapter").hidden ? $("lecEditChapter").value : $("lecEditSubChapter").value;
  const title = $("lecEditTitle").value.trim();
  const videoUrl = $("lecEditUrl").value.trim();
  const duration = $("lecEditDuration").value.trim() || null;
  const description = $("lecEditDescription").value.trim() || null;

  if (!/^https?:\/\//i.test(videoUrl)) {
    $("lecEditError").textContent = "Paste a valid link (starting with http:// or https://).";
    $("lecEditError").hidden = false;
    return;
  }

  const btn = $("lecEditSubmitBtn");
  btn.disabled = true;
  try {
    const { error } = await supabase
      .from("lectures")
      .update({ subject: subjectId, chapter_id: chapterId, title, video_url: videoUrl, duration, description })
      .eq("id", editingLectureId);
    if (error) throw error;

    closeEditModal();
    await renderLectureHistory();
    showToast("Lecture updated", `${title} was saved.`);
  } catch (err) {
    $("lecEditError").textContent = err.message || "Couldn't save changes — please try again.";
    $("lecEditError").hidden = false;
  } finally {
    btn.disabled = false;
  }
});

/* ============================ Add flow ================================ */

window.dataReadyPromise.then(async () => {
  populateSubjects();
  await loadChapters();
  populateChapterDropdown();
  await renderLectureHistory();
});

$("lecSubject").addEventListener("change", populateChapterDropdown);
$("lecChapter").addEventListener("change", populateSubChapterDropdown);

$("lecAddChapterBtn").addEventListener("click", async () => {
  const subjectId = $("lecSubject").value;
  const title = prompt(`New chapter name (${subjectName(subjectId)}):`);
  if (!title || !title.trim()) return;
  try {
    const created = await createChapter(subjectId, title.trim());
    populateChapterDropdown();
    $("lecChapter").value = created.id;
    populateSubChapterDropdown();
    showToast("Chapter created", `"${title.trim()}" added to ${subjectName(subjectId)}.`);
  } catch (err) {
    showToast("Couldn't create chapter", err.message || "Please try again.");
  }
});

$("lecAddSubChapterBtn").addEventListener("click", async () => {
  const chapterId = $("lecChapter").value;
  const title = prompt(`New sub-chapter name (inside "${chapterLabel(chapterId)}"):`);
  if (!title || !title.trim()) return;
  try {
    const created = await createChapter($("lecSubject").value, title.trim(), chapterId);
    populateSubChapterDropdown();
    $("lecSubChapter").value = created.id;
    showToast("Sub-chapter created", `"${title.trim()}" added inside ${chapterLabel(chapterId)}.`);
  } catch (err) {
    showToast("Couldn't create sub-chapter", err.message || "Please try again.");
  }
});

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", renderLectureHistory)
);

$("uploadLectureForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("lecError").hidden = true;

  const subjectId = $("lecSubject").value;
  const chapterId = $("lecChapter").value;
  const subChapterId = $("lecSubChapter").hidden ? null : $("lecSubChapter").value;
  const finalChapterId = subChapterId || chapterId;
  const title = $("lecTitle").value.trim();
  const videoUrl = $("lecUrl").value.trim();
  const duration = $("lecDuration").value.trim() || null;
  const description = $("lecDescription").value.trim() || null;

  if (!finalChapterId) {
    $("lecError").textContent = "Add a chapter first.";
    $("lecError").hidden = false;
    return;
  }
  if (!/^https?:\/\//i.test(videoUrl)) {
    $("lecError").textContent = "Paste a valid link (starting with http:// or https://).";
    $("lecError").hidden = false;
    return;
  }

  const btn = $("lecSubmitBtn");
  btn.disabled = true;
  try {
    const { error: insertError } = await supabase.from("lectures").insert({
      cohort_id: activeCohort,
      subject: subjectId,
      chapter_id: finalChapterId,
      title,
      video_url: videoUrl,
      duration,
      description,
    });
    if (insertError) throw insertError;

    $("uploadLectureForm").reset();
    populateChapterDropdown();
    await renderLectureHistory();
    showToast("Lecture added", `${title} — now visible to ${COHORT_DATA[activeCohort].name} students.`);
  } catch (err) {
    $("lecError").textContent = err.message || "Couldn't add lecture — please try again.";
    $("lecError").hidden = false;
  } finally {
    btn.disabled = false;
  }
});
