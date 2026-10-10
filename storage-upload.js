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

const NETWORK_ERROR = /failed to fetch|network|load failed|timeout|aborted/i;

/* Uploads each file under `<prefix>/<timestamp>-<safe name>` and returns the
   stored paths. `prefix` MUST start with the uploader's uid — the storage RLS
   keys on the first path segment. Throws on the first upload error, with a
   message a student can act on.

   Each file is read into memory first: a file picked from Google Drive/Photos
   (or edited after being chosen) can't be streamed by the browser and surfaces
   only as an opaque "Failed to fetch" — reading it up front turns that into a
   clear message, and uploads a stable copy. A network failure is retried once. */
export async function uploadToSubmissions(files, prefix) {
  const paths = [];
  for (const file of files) {
    let body;
    try {
      body = new Blob([await file.arrayBuffer()], { type: file.type });
    } catch {
      throw new Error(`Couldn't read "${file.name}". Save it to your phone's Downloads folder (not Drive or Photos) and choose it again.`);
    }

    let path;
    let error;
    for (let attempt = 0; attempt < 2; attempt++) {
      path = `${prefix}/${Date.now()}-${safeFileName(file.name)}`;
      ({ error } = await supabase.storage.from("submissions").upload(path, body, { contentType: file.type || undefined }));
      if (!error || !NETWORK_ERROR.test(error.message || "")) break;
    }
    if (error) {
      if (NETWORK_ERROR.test(error.message || "")) {
        throw new Error("Your connection dropped. Check your internet, then try again. Large files may need Wi-Fi.");
      }
      throw error;
    }
    paths.push(path);
  }
  return paths;
}
