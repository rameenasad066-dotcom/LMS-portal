/* Fetches real, cohort-scoped PDF notes from Supabase (table `notes` +
   storage bucket `notes`) — replaces the old hardcoded NOTES array in
   data.js. Exported rather than self-running because it needs
   STUDENT.cohortId, which is only known once auth-guard.js has resolved the
   signed-in student's real profile — auth-guard.js imports and calls this
   after that resolves, then calls renderNotes() (a plain global from
   student.js) to draw the Notes page with real data.

   Also exposes window.downloadNote(), since the Notes page's Download
   button is wired via classic-script event delegation in student.js and
   needs a way to reach into this module's Supabase client. */

import { supabase } from "./supabase-config.js";

function fmtSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function loadRealNotes() {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("cohort_id", STUDENT.cohortId)
    .order("created_at", { ascending: false });

  if (error) {
    NOTES = [];
    return;
  }

  NOTES = data.map((n) => ({
    id: n.id,
    subject: n.subject,
    chapter: n.chapter_id,
    title: n.title,
    cat: "Notes",
    size: fmtSize(n.size_bytes),
    date: n.created_at.slice(0, 10),
    storagePath: n.storage_path,
  }));
}

window.downloadNote = async function downloadNote(noteId) {
  const note = NOTES.find((n) => n.id === noteId);
  if (!note) return;

  const { data, error } = await supabase.storage
    .from("notes")
    .createSignedUrl(note.storagePath, 60);

  if (error || !data) {
    showToast("Download failed", "Please try again in a moment.");
    return;
  }

  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = note.title;
  document.body.appendChild(a);
  a.click();
  a.remove();
};
