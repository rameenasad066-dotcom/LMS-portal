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

/* Newest-first list of what's been added to this cohort, filtered by the
   search box. Organising (moving between topics, renaming topics, merging
   duplicates) lives on the Manage Content page — this panel is just
   "add a lecture, confirm it landed". */
function renderGrid() {
  const list = document.querySelector('[data-list="lecture-uploads"]');
  const empty = $("lectureUploadsEmpty");
  const q = $("lecturesSearch").value.trim().toLowerCase();

  if (!allLectures.length) {
    list.innerHTML = "";
    $("lecturesResCount").textContent = "";
    empty.textContent = "No lectures added yet for this cohort.";
    empty.hidden = false;
    return;
  }

  const shown = q
    ? allLectures.filter((l) =>
        `${l.title} ${l.description || ""} ${subjectName(l.subject)} ${chapterLabel(l.chapter_id)}`
          .toLowerCase()
          .includes(q)
      )
    : allLectures;

  $("lecturesResCount").textContent = q
    ? `${shown.length} of ${allLectures.length} lectures`
    : `${allLectures.length} lecture${allLectures.length === 1 ? "" : "s"}`;

  if (!shown.length) {
    list.innerHTML = "";
    empty.textContent = "No lectures match your search.";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  list.innerHTML = `<div class="res-grid">${shown.map(lectureCardHTML).join("")}</div>`;
}

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
  await loadChapters(activeCohort);
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
    const created = await createChapter(subjectId, title.trim(), null, activeCohort);
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
    const created = await createChapter($("lecSubject").value, title.trim(), chapterId, activeCohort);
    populateSubChapterDropdown();
    $("lecSubChapter").value = created.id;
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
    await renderLectureHistory();
  })
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
