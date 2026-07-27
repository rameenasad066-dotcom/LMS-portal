/* Wires the "Add Video Lecture" panel (teacher.html, Upload Notes view) to
   real Supabase table `lectures`. No file upload — the video itself lives
   on Rameen's Google Drive (shared "Anyone with the link can view"), so
   this just stores the link + metadata, same shape/pattern as
   teacher-notes-upload.js's real notes flow (own subject/chapter/sub-
   chapter selects, deliberately separate elements from the Notes form so
   picking a subject for one doesn't affect the other). Runs as a module —
   see teacher-auth-guard.js for the script-order reasoning. */

import { supabase } from "./supabase-config.js";
import { loadChapters, topLevelChapters, subChaptersOf, createChapter } from "./chapters-data.js";

const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function populateSubjects() {
  $("lecSubject").innerHTML = SUBJECTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
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

function chapterLabel(chapterId) {
  const c = CHAPTERS.find((x) => x.id === chapterId);
  return c ? c.title : chapterId;
}

async function renderLectureHistory() {
  const list = document.querySelector('[data-list="lecture-uploads"]');
  const empty = $("lectureUploadsEmpty");
  $("lecCohortTag").textContent = COHORT_DATA[activeCohort].name;

  const { data, error } = await supabase
    .from("lectures")
    .select("*")
    .eq("cohort_id", activeCohort)
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = "";
    empty.hidden = false;
    empty.textContent = `Couldn't load lectures: ${error.message}`;
    return;
  }

  empty.textContent = "No lectures added yet for this cohort.";
  empty.hidden = data.length > 0;
  list.innerHTML = data
    .map(
      (l) => `
    <li class="upload-item">
      <span class="file-chip">${ICONS.video}</span>
      <span class="u-info">
        <strong>${esc(l.title)}</strong>
        <small>${esc(subjectName(l.subject))} · ${esc(chapterLabel(l.chapter_id))} · ${fmtDate(l.created_at)}</small>
      </span>
      <span class="u-kind">MP4</span>
    </li>`
    )
    .join("");
}

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
