/* Study With Rameen · chapters — real, hierarchical, teacher-managed,
   cohort-scoped. Replaces the old static CHAPTERS array from content.json.
   A chapter may optionally have sub-chapters (parent_id set); most don't.
   Populates the global CHAPTERS array (declared in data.js) so every
   existing consumer (renderDrill in student.js, the upload forms' chapter
   selects, etc.) keeps working unchanged — they just see
   {id, subject, cohortId, parentId, title}.

   Cohort scoping added 2026-08-16 (see cohort-scoped-chapters.sql): each
   cohort owns its own tree, so renaming or deleting a topic in one never
   touches the other. Every caller must pass the cohort it's rendering —
   the student portal passes STUDENT.cohortId, the teacher portal passes
   whichever cohort pill is active, and re-loads on pill switch. */

import { supabase } from "./supabase-config.js";

export async function loadChapters(cohortId) {
  let query = supabase.from("chapters").select("*").order("sort_order", { ascending: true });
  if (cohortId) query = query.eq("cohort_id", cohortId);

  const { data, error } = await query;

  if (error) {
    CHAPTERS = [];
    return;
  }

  CHAPTERS = data.map((c) => ({
    id: c.id,
    subject: c.subject,
    cohortId: c.cohort_id,
    parentId: c.parent_id,
    title: c.title,
  }));
}

export function topLevelChapters(subjectId) {
  return CHAPTERS.filter((c) => c.subject === subjectId && !c.parentId);
}

export function subChaptersOf(chapterId) {
  return CHAPTERS.filter((c) => c.parentId === chapterId);
}

export async function createChapter(subjectId, title, parentId = null, cohortId) {
  const siblings = parentId
    ? subChaptersOf(parentId)
    : topLevelChapters(subjectId);
  const sortOrder = siblings.length
    ? Math.max(...siblings.map((_, i) => i)) + 1
    : 1;

  const { data, error } = await supabase
    .from("chapters")
    .insert({ subject: subjectId, cohort_id: cohortId, parent_id: parentId, title, sort_order: sortOrder })
    .select()
    .single();

  if (error) throw error;

  CHAPTERS.push({
    id: data.id,
    subject: data.subject,
    cohortId: data.cohort_id,
    parentId: data.parent_id,
    title: data.title,
  });
  return data;
}

export async function renameChapter(chapterId, newTitle) {
  const { error } = await supabase.from("chapters").update({ title: newTitle }).eq("id", chapterId);
  if (error) throw error;
  const c = CHAPTERS.find((x) => x.id === chapterId);
  if (c) c.title = newTitle;
}

// Reparents a chapter (promote to top-level with parentId=null, or move
// under a different top-level chapter). Doesn't touch notes/lectures —
// they keep pointing at the same chapter id, just its place in the tree
// changes.
export async function moveChapter(chapterId, newParentId) {
  const { error } = await supabase.from("chapters").update({ parent_id: newParentId }).eq("id", chapterId);
  if (error) throw error;
  const c = CHAPTERS.find((x) => x.id === chapterId);
  if (c) c.parentId = newParentId;
}

// Moves every note/lecture filed under sourceId onto targetId, reparents
// any sub-chapters of sourceId onto targetId too, then deletes the now-
// empty source chapter. Used to fix duplicate topics (e.g. "pillars of
// islam" vs "The Pillars of Islam") without losing any content.
export async function mergeChapter(sourceId, targetId) {
  const [{ error: notesErr }, { error: lecErr }, { error: subErr }] = await Promise.all([
    supabase.from("notes").update({ chapter_id: targetId }).eq("chapter_id", sourceId),
    supabase.from("lectures").update({ chapter_id: targetId }).eq("chapter_id", sourceId),
    supabase.from("chapters").update({ parent_id: targetId }).eq("parent_id", sourceId),
  ]);
  if (notesErr) throw notesErr;
  if (lecErr) throw lecErr;
  if (subErr) throw subErr;

  const { error: delErr } = await supabase.from("chapters").delete().eq("id", sourceId);
  if (delErr) throw delErr;

  CHAPTERS.forEach((c) => { if (c.parentId === sourceId) c.parentId = targetId; });
  const idx = CHAPTERS.findIndex((c) => c.id === sourceId);
  if (idx !== -1) CHAPTERS.splice(idx, 1);
}

// Deletes an empty chapter (the caller must have already verified there's
// no content in it or its sub-chapters — merge or move first otherwise).
// Sub-chapters cascade-delete at the DB level (chapters.parent_id has
// on delete cascade); notes/lectures referencing this chapter do NOT
// cascade, so Postgres rejects the delete outright if any slipped through.
export async function deleteChapter(chapterId) {
  const { error } = await supabase.from("chapters").delete().eq("id", chapterId);
  if (error) throw error;

  CHAPTERS = CHAPTERS.filter((c) => c.id !== chapterId && c.parentId !== chapterId);
}
