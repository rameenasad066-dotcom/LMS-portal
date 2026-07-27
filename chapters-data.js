/* Study With Rameen · chapters — real, hierarchical, teacher-managed.
   Replaces the old static CHAPTERS array from content.json. A chapter may
   optionally have sub-chapters (parent_id set); most don't. Populates the
   global CHAPTERS array (declared in data.js) so every existing consumer
   (renderDrill in student.js, populateChapterSelect in teacher.js, etc.)
   keeps working unchanged — they just see {id, subject, parent_id, title}
   instead of the old JSON shape. */

import { supabase } from "./supabase-config.js";

export async function loadChapters() {
  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    CHAPTERS = [];
    return;
  }

  CHAPTERS = data.map((c) => ({
    id: c.id,
    subject: c.subject,
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

export async function createChapter(subjectId, title, parentId = null) {
  const siblings = parentId
    ? subChaptersOf(parentId)
    : topLevelChapters(subjectId);
  const sortOrder = siblings.length
    ? Math.max(...siblings.map((_, i) => i)) + 1
    : 1;

  const { data, error } = await supabase
    .from("chapters")
    .insert({ subject: subjectId, parent_id: parentId, title, sort_order: sortOrder })
    .select()
    .single();

  if (error) throw error;

  CHAPTERS.push({ id: data.id, subject: data.subject, parentId: data.parent_id, title: data.title });
  return data;
}
