/* Study With Rameen · Student data layer
   Single source of truth for all student-facing content.
   Content is organised subject → chapter → items; shape mirrors
   teacher.js arrays so a future backend pass can wire both ends. */

/* Demo values below are shown until auth-guard.js overwrites them with the
   signed-in student's real profile from Supabase (see teacher-login.js /
   auth-guard.js). */
const STUDENT = {
  name:       'Ayesha Khan',
  initials:   'AK',
  cohortName: 'October/November 2026',
  cohortId:   'on26',
  email:      '',
  rank:       2,
  /* Portal subject ids this student is enrolled in — overwritten by
     auth-guard.js from their real profile. Pakistan Studies is two of these
     (history + geography), Islamiyat is the third. */
  subjects:   ['history', 'geography', 'islamiyat'],
};

/* Owner-editable content loads from data/*.json (see data/README.md);
   loadData() must resolve before the first renderAll(). CHAPTERS is no
   longer part of this — it's real and teacher-managed now, populated by
   chapters-data.js (see auth-guard.js / teacher-notes-upload.js). */
let SUBJECTS  = [];
let CHAPTERS  = [];
let QUIZZES   = [];
let HP_QUOTES = [];

async function loadData() {
  const [content, quizzes, hpQuotes] = await Promise.all([
    fetch('data/content.json').then(r => r.json()),
    fetch('data/quizzes.json').then(r => r.json()),
    fetch('data/hp-quotes.json').then(r => r.json()),
  ]);
  SUBJECTS  = content.subjects;
  QUIZZES   = quizzes.quizzes;
  HP_QUOTES = hpQuotes.quotes;
}

/* The subjects this student can actually see, in the portal's display order.
   Every subject-scoped screen (Syllabus Tracker, Lecture Vault, Notes,
   Practice Quizzes) renders from this rather than the full SUBJECTS list. */
function enrolledSubjects() {
  const mine = STUDENT.subjects || [];
  return SUBJECTS.filter(s => mine.includes(s.id));
}

function isEnrolledIn(subjectId) {
  return (STUDENT.subjects || []).includes(subjectId);
}

/* Same quote for every student on a given calendar day, a new one the next. */
function quoteOfTheDay() {
  if (!HP_QUOTES.length) return null;
  const dayNumber = Math.floor(Date.now() / 86400000);
  return HP_QUOTES[dayNumber % HP_QUOTES.length];
}

/* Video lectures — real, cohort-scoped, loaded from Supabase (see
   student-lectures.js). Empty until auth-guard.js resolves the signed-in
   student's cohort and fetches their real lectures. */
let LECTURES = [];

/* PDF notes — real, cohort-scoped, loaded from Supabase (see
   student-notes.js). Empty until auth-guard.js resolves the signed-in
   student's cohort and fetches their real notes. */
let NOTES = [];

/* ==========================================================================
   Persisted state — download toggles and watched markers survive refresh
   ========================================================================== */

let _state = {};

(function _load() {
  try { _state = JSON.parse(localStorage.getItem('swr_student') || '{}'); } catch { _state = {}; }
})();

function _save() {
  try { localStorage.setItem('swr_student', JSON.stringify(_state)); } catch {}
}

function setDownloaded(id, val) { _state['dl_' + id] = val; _save(); }
function isDownloaded(id)       { return !!_state['dl_' + id]; }

function setDownloadQuality(val) { _state.downloadQuality = val; _save(); }
function getDownloadQuality()    { return _state.downloadQuality || 'Auto (recommended)'; }

function isWatched(id) { return !!_state['w_' + id]; }
function setWatched(id, val) { _state['w_' + id] = val; _save(); }

/* ==========================================================================
   Computed helpers
   ========================================================================== */

function subjectProgress(sid) {
  const lecs = LECTURES.filter(l => l.subject === sid);
  const done = lecs.filter(l => isWatched(l.id)).length;
  return { done, total: lecs.length, pct: lecs.length ? Math.round((done / lecs.length) * 100) : 0 };
}

function newThisWeek(arr) {
  const cutoff = Date.now() - 7 * 86400000;
  return arr.filter(x => new Date(x.date + 'T00:00:00').getTime() >= cutoff).length;
}

function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}
