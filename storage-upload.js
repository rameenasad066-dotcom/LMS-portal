/* Shared helper for student file uploads to the private `submissions` bucket.
   Used by both the Assignments and Weekly Test upload flows so the path
   convention, filename sanitisation, and per-file error handling live in one
   place instead of being copy-pasted. */

import { supabase } from "./supabase-config.js";

/* Collapse anything outside a safe set to a hyphen so a filename can never
   introduce extra path segments (e.g. a "/" in the name) or characters the
   storage key rules reject. Never returns an empty string. */
export function safeFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

/* Uploads each file under `<prefix>/<timestamp>-<safe name>` and returns the
   stored paths. `prefix` MUST start with the uploader's uid — the storage RLS
   keys on the first path segment. Throws on the first upload error. */
export async function uploadToSubmissions(files, prefix) {
  const paths = [];
  for (const file of files) {
    const path = `${prefix}/${Date.now()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file);
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}
