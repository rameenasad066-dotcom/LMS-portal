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
const MAX_ATTEMPTS = 3;
const IMAGE_MAX_SIDE = 2200;
const IMAGE_SHRINK_ABOVE = 700 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isNetworkError(err) {
  return !!err && NETWORK_ERROR.test(err.message || "");
}

/* Runs `fn` (returning a supabase-style `{ error }` result) again after a
   short pause while the failure is a dropped connection. Any other error — an
   RLS rejection, a duplicate — comes straight back, since repeating it can't
   help. */
export async function retryNetwork(fn) {
  let result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    result = await fn();
    if (!result.error || !isNetworkError(result.error)) return result;
    if (attempt < MAX_ATTEMPTS) await sleep(900 * attempt);
  }
  return result;
}

/* A phone photo is typically 3–8 MB; several of them over mobile data is what
   makes a submission fail. Downscaling to ~2200px / JPEG keeps handwriting
   readable at roughly a tenth of the size. Anything that isn't a large
   photo, or any step that fails, falls back to the original file. */
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < IMAGE_SHRINK_ABOVE) return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : null;
  } catch {
    return null;
  }
}

/* Files already stored during this page session, keyed by uploader prefix +
   file identity. When a submission fails part-way (say photo 4 of 5), the
   student's next try skips the photos that already made it instead of
   starting over — which is what kept failing on weak connections. */
const alreadyStored = new Map();

function fileKey(prefix, file) {
  return `${prefix}|${file.name}|${file.size}|${file.lastModified}`;
}

/* Uploads each file under `<prefix>/<timestamp>-<safe name>` and returns the
   stored paths. `prefix` MUST start with the uploader's uid — the storage RLS
   keys on the first path segment. Throws on the first unrecoverable error,
   with a message a student can act on. `onProgress(done, total)` fires before
   each file so the button can say "Uploading 2 of 5…". */
export async function uploadToSubmissions(files, prefix, onProgress) {
  const paths = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) onProgress(i, files.length);

    const key = fileKey(prefix, file);
    if (alreadyStored.has(key)) {
      paths.push(alreadyStored.get(key));
      continue;
    }

    // Reading the file up front turns an unreadable one (picked from Google
    // Drive/Photos, or edited after choosing) from an opaque "Failed to fetch"
    // into a clear message, and uploads a stable copy.
    let body = await shrinkImage(file);
    let name = safeFileName(file.name);
    if (body) {
      name = name.replace(/\.[^.]+$/, "") + ".jpg";
    } else {
      try {
        body = new Blob([await file.arrayBuffer()], { type: file.type });
      } catch {
        throw new Error(`Couldn't read "${file.name}". Save it to your phone's Downloads folder (not Drive or Photos) and choose it again.`);
      }
    }

    let path;
    const { error } = await retryNetwork(() => {
      path = `${prefix}/${Date.now()}-${name}`;
      return supabase.storage.from("submissions").upload(path, body, { contentType: body.type || undefined });
    });
    if (error) {
      if (isNetworkError(error)) {
        throw new Error(`Your connection dropped${i ? ` after ${i} of ${files.length} files` : ""}. Check your internet and press the button again — files already sent won't be re-uploaded.`);
      }
      throw error;
    }
    alreadyStored.set(key, path);
    paths.push(path);
  }
  return paths;
}

/* Call once a submission row is saved, so a later upload of the same files
   (a re-attempt after the teacher deletes the row, say) starts clean. */
export function forgetStored(prefix, files) {
  files.forEach((f) => alreadyStored.delete(fileKey(prefix, f)));
}
