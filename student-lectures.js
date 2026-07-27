/* Fetches real, cohort-scoped video lectures from Supabase (table
   `lectures`) — replaces the old hardcoded LECTURES array in data.js.
   Videos themselves live on Rameen's Google Drive (shared "Anyone with the
   link"); this just stores the link — student.js's existing play-button
   handler already does `window.open(lec.url, '_blank')`, so nothing about
   playback needed to change, only where LECTURES data comes from.
   Exported rather than self-running because it needs STUDENT.cohortId —
   same pattern as loadRealNotes() in student-notes.js. */

import { supabase } from "./supabase-config.js";

export async function loadRealLectures() {
  const { data, error } = await supabase
    .from("lectures")
    .select("*")
    .eq("cohort_id", STUDENT.cohortId)
    .order("created_at", { ascending: false });

  if (error) {
    LECTURES = [];
    return;
  }

  const cutoff = Date.now() - 7 * 86400000;
  LECTURES = data.map((l) => ({
    id: l.id,
    subject: l.subject,
    chapter: l.chapter_id,
    title: l.title,
    date: l.created_at.slice(0, 10),
    duration: l.duration || "—",
    url: l.video_url,
    isNew: new Date(l.created_at).getTime() >= cutoff,
  }));
}
