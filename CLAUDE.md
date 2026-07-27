# Study With Rameen — LMS Portal

Custom-built Learning Management System for Rameen Asad's O Level / IGCSE Pakistan Studies & Islamiyat tutoring business (Instagram: @studywithrameen). This is a real branded product, not a generic demo.

---

## Project Structure

```
LMS portal/
├── index.html        — Gateway / landing page (Teacher Portal + Student Portal buttons)
├── teacher.html      — Teacher SPA (7 views, hash router)
├── teacher.js        — Teacher SPA logic (router, data store, render functions)
├── student.html      — Student SPA (9 views, hash router)
├── student.js        — Student SPA logic (router, drill-down nav, quiz engine, renders, event delegation)
├── data.js           — Student data layer (lectures/notes demo data, localStorage state, loadData() for JSON)
├── owl.js            — Study-buddy owl easter egg: flies in on load, perches, says a study fact on click (shared by all three pages)
├── data/
│   ├── content.json  — Subjects & chapters (owner-editable)
│   ├── quizzes.json  — Practice quizzes (owner-editable; History/Geography/Islamiyat all real content now — Islamiyat pending her religious-accuracy review)
│   ├── current.json  — Weekly test: title, PDF path, deadline, submission instructions
│   ├── owl-facts.json— Study facts the owl says on click (owner-editable; ALL current facts are placeholders)
│   └── README.md     — Non-developer guide for editing the JSON files
├── tests/            — (owner-created) weekly test PDFs referenced by current.json
├── style.css         — Shared design system for all portals
└── .claude/
    └── launch.json   — Dev server config (python -m http.server 5500)
```

---

## Dev Server

**Runtime:** Python (npx is NOT available on this machine)
```
python -m http.server 5501
```
Launch via `.claude/launch.json` → server name `"static-server"` (port moved from 5500 → 5501 on 2026-07-22 after Windows started reserving 5500 in its excluded port range).

**Known gap (2026-07-22, still present 2026-07-26):** on at least one machine used for this project, `python`/`python3` resolve only to the Windows Store's app-execution-alias stub, not a real interpreter — `python --version` fails with "Python was not found." `py`, `node`, `npx`, and `php` were also absent. If the dev server won't start, check this before assuming the code broke; a real Python install (or an alternative static server) is needed, and installing one is a system change the owner should approve first. When the local server is unavailable, JSON data files can still be validated for syntax/structure via PowerShell's `ConvertFrom-Json` (no server needed) — used successfully to validate `data/quizzes.json` on 2026-07-26.

**Preview note:** `preview_screenshot` consistently times out in this environment. Always verify with `preview_snapshot`, `preview_inspect`, and `preview_eval` instead. Never rely on screenshots.

---

## Brand Identity

**Business:** Study With Rameen  
**Teacher / Owner:** Rameen Asad  
**Subjects:** O Level & IGCSE Pakistan Studies (2059), Islamiyat (2058)  
**Portal subjects:** Student content is organised into three subjects — History + Geography (the two Pak Studies papers) + Islamiyat  
**Cohorts:** October/November 2026 (currently running) · May/June 2027

**Logo:** Circular red ring with green open-book/leaf motif and red "RA" wordmark. Rendered as `<img src="logo.png" class="logo">` in all three HTML files. The source file is `logo.png` (transparent background PNG) in the project root.

**Study-buddy owl easter egg (`owl.js`):** on every page load a soft snowy owl flies across the screen carrying a letter, then perches — on the portals it sits in-flow at the bottom of the sidebar (never overlaps UI); on the gateway it lands on the card's red top border. Click → hop + a speech bubble with a **study fact** (syllabus fact / examiner tip / key date). Facts come from `data/owl-facts.json` (owner-editable; fetched by `owl.js` itself, shuffled, no immediate repeats); if that file can't load, the owl falls back to a few built-in facts so it's never silent (no toast — it fails quietly). Owl art is fully neutral (white/gray/ink) — big dark round eyes with white catch-lights, neutral beak & talons (no amber anywhere on the bird); the ONLY red is the wax seal on the letter — never green, per the color rule. The cute redesign is deliberately soft/rounded (no spiky wings or sharp tufts). Two wing sets: spread wings (flight — flap-burst-then-glide cycle + air bob) and folded wings (perched); the landing swap happens via the WAAPI `finished` promise (not the finish event, which stalls in hidden tabs). Respects `prefers-reduced-motion` (appears pre-perched, no flight).

**Gateway entrance:** staggered card entrance (logo pop → title → subtitle → buttons) + typewriter effect on "Pakistan Studies & Islamiyat" with blinking red caret, driven by a small inline script in `index.html`.

---

## Design System & Color Palette

All colors are defined as CSS custom properties in `style.css` `:root`.

| Token | Hex | Usage |
|---|---|---|
| `--red` | `#C8202C` | Nav, primary buttons, active states, stat card top-bars |
| `--red-deep` | `#971822` | Hover/active/pressed state for red elements |
| `--red-blush` | `#FBE7E9` | Card backgrounds, subtle tags, panel fills |
| `--red-blush-soft` | `#FDF3F4` | Page background tint |
| `--red-blush-line` | `#EFCED1` | Borders on blush backgrounds |
| `--green` | `#3C9A44` | Success, on-time pills, live dot, scoreboard podium, download-ON toggle |
| `--green-deep` | `#2E7D36` | Green hover state |
| `--green-light` | `#E7F5E8` | Green badge/pill backgrounds |
| `--ink` | `#1A1A1A` | Primary body text |
| `--gray` | `#6B7280` | Secondary/meta text |
| `--gray-soft` | `#9CA3AF` | Placeholder text, disabled labels |
| `--gray-light` | `#E5E7EB` | Dividers, table borders, input borders |
| `--bg` | `#FAF8F8` | Page background |
| `--surface` | `#FFFFFF` | Card/panel surfaces |

**Critical color rule:** Red dominates all structural elements (top nav, sidebar, headers, primary buttons, active indicators). Green appears ONLY on success/live/highlight states — on-time submission pills, graded checkmarks, the live-dot pulse, the download-ON toggle, scoreboard podium bars. Green is never decorative. This rule must never be violated.

**Typography:**
- Headings: `Poppins` (weights 500–800)
- Body: `Inter` (weights 400–700)
- Loaded from Google Fonts in every HTML file's `<head>`

---

## Architecture Pattern

All portals are **static SPAs** — no build step, no framework, pure HTML/CSS/JS.

### Hash Router
Every portal uses the same `hashchange`-based router pattern:
```javascript
const VIEW_TITLES = { dashboard: 'Dashboard', uploads: 'Upload Manager', /* etc */ };
function showView() {
  let view = (location.hash || '#dashboard').slice(1);
  if (!VIEW_TITLES[view]) view = 'dashboard';
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.dataset.view !== view; });
  document.querySelectorAll('.snav-item[data-view]').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  document.getElementById('viewTitle').textContent = VIEW_TITLES[view];
}
window.addEventListener('hashchange', showView);
document.addEventListener('DOMContentLoaded', showView);
```
HTML: each sidebar link uses `href="#viewname"` + `data-view="viewname"`. Each content section uses `<section class="view" data-view="viewname" hidden>`.

### Data Store
All data lives in top-level JS arrays/objects — no backend yet. All views render from the same arrays, so dashboard previews always stay in sync with full-page views. Teacher data resets on refresh (in-memory only). Student content lives in `data.js`; the student's download/watched toggles persist via localStorage key `swr_student` (approved exception — add no other storage without an explicit request).

### Shared CSS
`style.css` is the single shared design system. All HTML files link to it. Do not create per-page CSS files — add new component classes to `style.css` with a clear section comment.

---

## Teacher Portal (`teacher.html` + `teacher.js`)

**7 nav views:** `dashboard` · `uploads` (labelled "Upload Notes") · `assignments` · `students` · `attendance` · `scoreboard` · `settings`. One non-navlinked router view also exists: `student-report` (reached by clicking a student in the roster). (The old fake `grades` "Grade Distribution" view was deleted 2026-07-22.)

**Dashboard (real, Supabase-backed — rebuilt 2026-07-22):** the demo-era dashboard (fake Quick-Publish dock with a non-functional "Add Recorded Lecture" button, hardcoded "Recent Uploads", always-zero "Pending Review" card, permanently-empty "Needs Attention" stub) is gone. `teacher-dashboard.js` now computes every widget live from the real progress-system tables, cohort-scoped to the active pill, re-rendering on cohort switch (same module pattern as `teacher-roster.js`): **Submissions to Mark** (count of `submissions` rows with no matching `marks` row, links to Assignments), **attendance nudge** (a red-blush call-to-action shown only when today's class isn't marked in `attendance`), **Needs Attention for real** (students whose average mark % < 50 or attendance % < 67 — thresholds are a judgment call, flagged), **Recent submissions** (latest 5, with Marked/To-mark pill + Late flag), **Deadlines** (assignments nearest-due first, overdue flagged), and **Recent Notes** (latest 5 real notes). Only `renderHeader` (cohort meta + date) stayed in `teacher.js`; all the fake render functions, the `UPLOADS`/`SUBMISSIONS`/`GRADE_DISTRIBUTION`-era helpers, the date helpers, `quickPublish`, and the dock's `populate*Select` were deleted. `subjectName` + `ICONS.pdf` were kept because `teacher-notes-upload.js` uses them. The nav item + page title "Upload Manager" was renamed to "Upload Notes" (it only uploads notes now). New CSS: `.attn-nudge`, `.stat-card-link`.

**Assignments & marking (real, Supabase-backed — progress system Phase 1):** `teacher-assignments.js` posts homework/assignments/tests (table `assignments`: cohort_id, type, title, due_date, max_marks) to the active cohort and renders a marking queue per assignment — real student list (needs the "Teacher can view all students" RLS policy), submission status (Late = submitted after due_date 23:59), signed-URL file viewing from private bucket `submissions`, and mark + feedback entry upserted into table `marks` (unique per assignment × student; deliberately separate from `submissions` so WhatsApp-submitted weekly tests can be marked with no upload). Student side: `student-assignments.js` (called from `auth-guard.js` once cohortId is known) lists assignments with upload forms (photos + PDFs, multiple files, path `<uid>/<assignmentId>/<ts>-<name>` — first path segment must be the uploader's uid per storage RLS) and shows Submitted/Late/Marked states with marks + feedback. Late submissions are allowed, flagged.

**The old fake Submissions view is gone (removed 2026-07-22).** It was a hardcoded demo page (`SUBMISSIONS` array — two fake students, "Zainab Tariq"/"Omar Sheikh") left over from before this project had a real backend; once Phase 1 built the real Assignments marking queue, the two pages showed contradictory data side by side, which is why Rameen asked for Submissions to be deleted outright. Removed: the sidebar nav item, the `data-view="submissions"` section, `renderSubmissions()`, the `SUBMISSIONS` array, `ICONS.check`, and the now-dead CSS (`.live-badge`, `.live-dot`, `.ts-time`, `.ts-date`, `.graded`). (The "Pending Review" stat and Attention-banner that once relied on a `pendingCount` stub were later removed outright in the 2026-07-22 dashboard rebuild — the real "Submissions to Mark" count in `teacher-dashboard.js` replaces them.) `.sub-table`, `.status-pill`, `.student-cell`, `.new-tag` all survived the cleanup since the Students roster, Assignments queue, and My Grades still use them.

**Scoreboard & Grades (real, Supabase-backed — progress system Phase 2):** the old fake `COHORT_SCOREBOARD` object and `renderScoreboard()` are gone from `teacher.js`. Both portals call the same `get_scoreboard(target_cohort)` Postgres function (`supabase/migrations/scoreboard.sql`, SECURITY DEFINER) via `supabase.rpc(...)` — it computes each student's monthly percentage from `marks`/`assignments` server-side and returns only the top-3 names/initials/ids plus the caller's own numeric rank, so raw marks never reach either client. Score = equal-thirds category weighting (changed 2026-07-22, superseding the original "everything counts" pooled-points version): homework/assignment/test (`assignments.type`) each contribute their own points-earned/points-possible % for the month, then those category percentages are averaged — a category with zero graded items is skipped, not counted as 0%. One test now weighs the same as five homeworks. This only affects the scoreboard ranking; the "Average %" shown on My Grades / Student Report is a separate simple mean across all graded items and was deliberately left unchanged. Teacher side: `teacher-scoreboard.js`, re-renders on cohort pill click. Student side: `student-scoreboard.js` (podium + `#sRankCallout`, "YOU" tag on the caller's own podium column) and `student-grades.js` (real My Grades table — own `marks`+`assignments`+`submissions`, letter grade banding 90=A*/80=A/70=B/60=C/50=D/else U, Improving/Declining/Steady trend), both called from `auth-guard.js` once `STUDENT.cohortId` is known.

**Key JS structures:**
```javascript
COHORT_DATA = { on26: {...}, mj27: {...} }  // per-cohort stats & meta — May/June 2026 (mj26) was permanently removed
```
(The fake `UPLOADS` array was deleted in the 2026-07-22 dashboard rebuild — stale reference here until 2026-07-23.)

**Upload Notes (real, Supabase-backed):** the old fake dropzone/backdating flow is gone. `teacher-notes-upload.js` uploads a PDF to Supabase Storage bucket `notes` and inserts a matching row (`cohort_id`, `subject`, `chapter_id`, `title`, `storage_path`, `size_bytes`) into table `notes`, scoped to whichever cohort pill is active. `chapter_id` is a real foreign key into table `chapters` (see below), not a plain string. RLS restricts each student to their own cohort's rows; only the teacher can insert.

**Video Lectures (real, Supabase-backed — built 2026-07-23):** the old hardcoded demo `LECTURES` array and the fake `quickPublish()` dashboard shortcut are both gone. Rameen's lecture videos live on her own **Google Drive** (shared "Anyone with the link can view" — not YouTube; she already had lectures on Drive, so that's what got built) — the portal only stores the link + metadata, no file upload. `teacher-lectures-upload.js` — a second panel ("Add Video Lecture") on the same Upload Notes page, own `lecSubject`/`lecChapter`/`lecSubChapter` selects deliberately kept separate from the Notes form's `unSubject` etc. so picking a subject for one doesn't affect the other — inserts into table `lectures` (`cohort_id`, `subject`, `chapter_id`, `title`, `video_url`, `duration` nullable). Same chapter-creation reuse (`chapters-data.js`) as the Notes form. Student side: `student-lectures.js` (`loadRealLectures()`, called from `auth-guard.js` before `renderVault()`) populates the same `LECTURES` array the Lecture Vault drill-down already read — `renderDrill()`/`chapterItems()`/`lectureCardHTML()` in `student.js` needed zero changes, exact same "populate the array, reuse existing render" pattern as `student-notes.js`. Playback: the play button already had real logic waiting (`window.open(lec.url, '_blank')` if `lec.url` is set, "coming soon" toast otherwise) — opens the Drive link in a new tab, not an inline embed (simplest, most reliable option for Drive links; inline embedding was not chosen). **Also fixed a previously-latent gap while wiring this up:** there was no way to ever mark a lecture "watched" — `isWatched()` read a hardcoded `lec.watched` demo flag that real lectures don't have, and the `_state['w_' + id]` localStorage fallback it already checked had no matching setter. Added `setWatched(id, val)` to `data.js` (same `swr_student` blob, same pattern as the download toggle) and now call it when Play is clicked, then re-render both the Vault and the Dashboard's Syllabus Tracker rings (`renderDashboard()`) so progress updates immediately — without this fix, the Syllabus Tracker would have shown 0% forever once the fake `watched: true` demo flags were gone.

**Roster (real, Supabase-backed):** the old fake `ROSTER` array is gone. `teacher-roster.js` lists real students for the active cohort (name, email, joined date, submission count) via a "Teacher can view all students" RLS policy, and offers a **Reset Password** action per student — the only safe fix for a forgotten password, since the original is never recoverable (one-way hashed). Resetting calls the `reset-student-password` Edge Function (same identity-verification pattern as `create-student`) and displays the new credentials in the reused Add Student result box. The Add Student form's password field is now a plain editable input (not auto-generated/readonly) — Rameen can type her own or click "Generate one." Since `renderRosterReal()` already fetches every student row for the active cohort, it also sets the Dashboard's **Students Enrolled** stat card (`students.length`) — the hardcoded fake numbers (`COHORT_DATA.*.stats.students`, "38"/"12") were removed 2026-07-22, no separate query needed.

**Chapters (real, teacher-managed, hierarchical):** no longer in `content.json`. Table `chapters` (`subject`, `parent_id` nullable self-reference, `title`, `sort_order`) — a chapter with `parent_id = null` is top-level; one with it set is a sub-chapter. `chapters-data.js` populates the global `CHAPTERS` array (`{id, subject, parentId, title}`) via `loadChapters()`, called from `auth-guard.js` (student) and `teacher-notes-upload.js` (teacher) — both need to await this before rendering anything chapter-dependent, since it's an async Supabase fetch that module scripts don't wait for by default (see `window.dataReadyPromise` / `window.chaptersReadyPromise` patterns in those files). Teacher creates chapters/sub-chapters inline from the Upload Notes page ("+ Add chapter" / "+ Add sub-chapter") via `createChapter()`. Student's Vault/Notes drill-down (`renderDrill()` in `student.js`) goes one level deeper automatically for any chapter that has sub-chapters, using distinct `.sub-ch-*` CSS classes (not reused `.ch-item`/`.ch-body`) to avoid descendant-selector collisions between nested accordion levels.

**Student Report (real, Supabase-backed — progress system Phase 3, teacher-only):** `teacher-student-report.js`, opened by clicking a student's name in the **Students** roster (now a button, `data-open-report`, not plain text). Renders into a router view (`data-view="student-report"`, not sidebar-linked — reached only via the roster click, same pattern as the pre-existing orphaned `grades` view). Reads `marks` joined to `assignments` directly for that one student (not through `get_scoreboard()` — that function's raw-marks restriction exists to stop students seeing each other's marks; it doesn't apply to the teacher's own view of her own students, who she already has full RLS read access to). Shows latest score + trend vs. the previous graded item, an estimated grade band (same 5-band scale as My Grades: A*90+/A80+/B70+/C60+/D50+/U<50), an equal-thirds-weighted average % across all graded submissions (updated 2026-07-22 to match the Scoreboard's formula — `equalThirdsAvg()` averages homework/assignment/test category percentages, skipping any category with zero graded items, all-time rather than month-scoped like the Scoreboard), a hand-rolled SVG "marks over time" line chart with three background zones (green ≥80%, neutral 50–79%, red <50% — reusing existing palette tokens, no new colors introduced), a grade-bands legend strip, and a reverse-chronological graded-work list with per-item progress bars and an above/below-this-student's-own-average indicator. `.grade-chip` gained `.mid` (neutral) and `.risk` (red) modifier classes for this — existing usages elsewhere are untouched and stay green-only.

**Practice Quiz tracking (real, Supabase-backed):** the quiz engine (`quiz` view, student.js) previously had **zero persistence** — the result screen literally said "screenshot this and send it to Miss Rameen." Now every completed attempt is saved to table `quiz_attempts` via `student-quiz-attempts.js` (`window.saveQuizAttempt`, called from `renderQuizResult()` — student.js is a classic script and can't `import` a module, so the module attaches itself to `window` instead, same bridge pattern used elsewhere). `quizState` gained an `answers` array, populated as the student answers each question (MCQ: picked option + correct option; short-answer: their typed text, since self-marking via "I got it right/wrong" isn't fully reliable and Rameen wants to be able to spot-check what they actually wrote). Deliberately isolated from `marks`/`assignments` — no foreign keys, and never touched by `get_scoreboard()`, `equalThirdsAvg()`, or any grade/band/average calculation; this is informal self-testing visibility only, not grading. Surfaced on the teacher Student Report page as a new "Practice Quizzes" panel (explicitly labelled "not included in grade, band, or average") — `renderQuizAttempts()` in `teacher-student-report.js`, one collapsible row per attempt, click to expand a full question-by-question breakdown (topic, correct/incorrect, and either the MCQ picked-vs-correct or the short-answer typed text). Retakes insert new rows rather than overwriting, so she sees full practice history, not just the latest attempt.

**Attendance (real, Supabase-backed — progress system Phase 4):** `teacher-attendance.js`, new **Attendance** nav item/view. One row per (`class_date`, `student_id`) in table `attendance` (`status`: present/absent/leave — renamed from "late" 2026-07-23, see `attendance-leave.sql`), unique per day — Rameen picks a date (input defaults to today, `max` = today, backdating allowed for a missed roll-call) and taps a status button per student in the active cohort; each tap upserts immediately via `onConflict: "class_date,student_id"` (same upsert pattern as `marks`), not a batch form-submit — a live roll-call is an immediate-tap interaction. **Leave** is an excused absence and is excluded from the attendance % entirely (neither numerator nor denominator) — only Present counts toward it, Absent counts against it (confirmed by Rameen 2026-07-23; the exclusion logic lives in `attendancePct()` in both `teacher-student-report.js` and `student-grades.js`, and inline in `teacher-dashboard.js`'s Needs-Attention calc — three separate implementations, not shared, since teacher.html/student.html have no common module loader). Surfaced in two places: the teacher Student Report page (`srAttendancePct`/`srAttendanceSub`, all-time) and the student's own My Grades page (`sAttendancePct`/`sAttendanceSub`, all-time) — both are a 4th stat card, so those pages switched from the `.stats.three` CSS variant to the plain 4-column `.stats` default. RLS mirrors `marks`: teacher full access, student sees only their own rows (`"Students can view their own attendance"`).

**Settings (real, Supabase-backed):** the old "Demo only" fake form is gone. `teacher-settings.js` reads/writes a new one-row table `teacher_settings` (keyed to `TEACHER_UID`, since the teacher account had no profile table before this) for display name and default cohort, and updates the topnav `.user-chip-name` live on save. Email is real too, via `supabase.auth.updateUser({ email })` — Supabase sends a confirmation link to the new address first, so the change isn't instant (same async pattern as any Supabase email change; the UI says so). Default cohort is applied on load by programmatically `.click()`-ing the matching cohort pill if it differs from the initial `"on26"` — this deliberately reuses every other cohort-scoped module's existing pill-click listener (roster, assignments, scoreboard, notes-upload) instead of re-implementing cohort-switch logic in a second place.

**Cohort switching:** Cohort pill clicks set `activeCohort`, then call `renderAll()` which re-renders all lists and stats for the new cohort.

---

## Student Portal (`student.html` + `student.js` + `data.js` + `data/*.json`)

**9 views:** `dashboard` · `vault` · `notes` · `quiz` · `weekly` · `assignments` · `grades` · `scoreboard` · `settings`

**JSON data layer:** `SUBJECTS`, `CHAPTERS`, `QUIZZES`, `CURRENT` are `let` bindings in `data.js`, filled by `loadData()` (fetches `data/content.json`, `data/quizzes.json`, `data/current.json`). Init is `loadData().then(renderAll)` — a fetch/parse failure shows a "Content failed to load" toast (the owner's JSON-typo signal). Lectures remain hardcoded in `data.js`; notes, announcements, grades and scoreboard are real and Supabase-backed (see below). The cohort-bar deadline (`#cohortDeadline`) is derived from `current.json`.

**Demo student:** Ayesha Khan ("AK" avatar initials), October/November 2026 cohort, rank #2.

**Data (`data.js`):**
```javascript
SUBJECTS      = [{ id, name, paper }]                    // history | geography | islamiyat
CHAPTERS      = [{ id, subject, title }]                 // 3 per subject
```
`NOTES` and `LECTURES` are no longer hardcoded — both `let [] ` in `data.js`, populated for real by `student-notes.js` (table `notes` + storage bucket `notes`) and `student-lectures.js` (table `lectures`, video hosted on Google Drive not in Supabase Storage — just the link is stored), both cohort-scoped via RLS keyed to `cohort_id`, same pattern as `students`. Called from `auth-guard.js` once `STUDENT.cohortId` is known, then `renderNotes()`/`renderVault()` draw them — the existing drill-down rendering in `student.js` needed zero changes for either, since it already just reads the `NOTES`/`LECTURES` arrays. Notes download uses a 60-second signed URL (`window.downloadNote`, exposed by `student-notes.js` so the classic-script event-delegation handler in `student.js` can reach it); lecture playback just opens `lec.url` (the Drive link) in a new tab.

Announcements are similarly no longer in `data.js` — real, Supabase-backed, cohort-scoped (table `announcements`). Teacher posts via `teacher-announcements.js` (Broadcast Noticeboard, scoped to whichever cohort pill is active); students read via `student-announcements.js`, called from `auth-guard.js` once `STUDENT.cohortId` is known from their profile.

`GRADES` and `SCOREBOARD` are gone from `data.js` entirely (progress system Phase 2) — see the Scoreboard & Grades section above; the real replacements are `student-grades.js` and `student-scoreboard.js`, both Supabase-backed via the shared `get_scoreboard()` RPC.

**Single-device login enforcement (real, Supabase-backed, students only — built 2026-07-26):** `session-guard.js`, a new shared module. Table `active_sessions` holds one row per student — a random token, overwritten on every fresh login. `login.js` and `update-password.js` (student branch only; the teacher branch is untouched) write a new token there and to this device's localStorage on every successful sign-in/password-reset-completion. `auth-guard.js` compares the local token to the database row on load and every 30s + on tab-focus while the portal stays open; a mismatch means a newer login happened on another device, so this one is immediately signed out and redirected to `login.html?reason=elsewhere` with an explanatory message. Deliberately students-only — the teacher account is exempt so Rameen is never locked out of her own portal by switching devices.

**My Grades got a Phase 3 upgrade (2026-07-22):** after seeing the teacher-only Student Report page, Rameen asked for the same visual — chart, zones, progress bars — on the student's own side. `student-grades.js` now also renders a "Marks over time" SVG line chart (`#sGradeChart`, same `buildChart()`/`zoneColorFor()` as `teacher-student-report.js`, duplicated rather than shared since teacher.html/student.html are separate apps with no common module loader) with the same 3 zones and grade-bands legend, plus per-row progress bars in the Grading Tracker table. `letterGrade()` here now returns `{label, cls}` instead of a bare string (matching the teacher version) so `.grade-chip` can carry `.mid`/`.risk` severity styling instead of always showing green — every call site was updated (`sGradeLatest`, the trend arrow's `A → B → C` sequence, and the table). The existing 3 stat cards (Latest Grade / Graded So Far / Progress Trend) were kept as-is; the chart is additive, inserted as a new panel between the stats and the table.
Helpers remaining in `data.js`: `isDownloaded/setDownloaded` and `isWatched/setWatched` (both localStorage-backed, `swr_student`), `subjectProgress(sid)` → `{done, total, pct}`, `newThisWeek`, `fmtDate`. `setWatched()` is new (2026-07-23) — see the Video Lectures bullet above for why it didn't exist before.

**Drill-down nav (vault & notes):** Level 1 subject cards → Level 2 chapter accordion → Level 3 content grid inside the expanded chapter. State lives in `drill = { vault: {subject, chapter}, notes: {subject, chapter} }`. A subject click re-renders via `renderDrill(view)`; a chapter click only toggles `.open` (CSS `grid-template-rows: 0fr → 1fr` expand) so the transition isn't destroyed by a re-render. Chapters with zero items in a section are hidden from that section.

**Dashboard widgets:** stat row · Syllabus Tracker rings (SVG `stroke-dashoffset`, red; turns green with "Complete ✓" ONLY at 100% — success state) · Leaderboard mini podium (`.podium.mini`, shares podium markup + rise animation with the scoreboard) · Announcement Board (`.ann-list`; tag colors: pinned = red fill, action = blush, info = neutral). The welcome banner has NO join button — live-class links are shared via WhatsApp (banner text says so).

**Quiz engine (`quiz` view, renders into `#quizArea`):** three phases — list (`renderQuizList`), player (`renderQuizQuestion` + `advanceQuiz`), result (`renderQuizResult`); state in `quizState = { quiz, i, score, answered, answers }`. MCQ: click auto-marks (correct option green = success state, wrong pick blush/red), then Next. Short answer: optional textarea → "Reveal model answer" → student self-marks via "I got it right" (`.btn-success`, green) / "I got it wrong". Result screen reuses the ring component (`score/total`, green ONLY at 100%). **Attempts ARE now persisted** (table `quiz_attempts`, see the Practice Quiz tracking bullet below) — the old "screenshot and send to Miss Rameen" note was replaced since it's no longer true.
**Quiz schema:** every question in `quizzes.json` carries `topic` and `question_type`, though no live feature currently reads `topic` (see Past-Paper Explorer below). "Name four points" questions list 6–7 valid points in `model_answer` plus optional `marking_note`.

**Past-Paper Explorer — built 2026-07-26, then removed 2026-07-27.** Built as a tab inside the `quiz` view (`.quiz-tabs`, `renderExplorer()`, `explorerState`) that flattened every question across `QUIZZES`, filterable by subject/topic, showing each match statically with its answer already visible (no attempt/scoring). Populated with 225 real CAIE Pakistan Studies (2059) past-paper questions extracted from 6 exam sessions (2023–2025), each grounded in that session's actual mark scheme. **Rameen killed the feature after using it**, for two real problems: (1) each question's `topic` tag was specific to the single question it came from (e.g. one exact essay prompt), not a shared per-theme taxonomy, so a topic she knew recurred across many years of real papers she'd solved herself still showed "1 question found" — the promised topic-merge only worked on the rare exact-title match, not the way a real topical past-paper compilation groups recurring themes; (2) showing the model answer immediately with no attempt-first gate defeated the point of practicing past papers at all. She chose to scrap the whole feature rather than patch it, to get the already-working Practice Quizzes live for students now — "past paper thinking" is explicitly deferred, not abandoned. Fully removed: the HTML tab toggle + `#explorerArea`, all explorer JS (`explorerState`/`explorerTopics`/`explorerQuestions`/`explorerQuestionCard`/`renderExplorer`, plus the `quiz-tab`/`explSubject`/`explTopic` event handlers), the `.quiz-tabs`/`.explorer-filters`/`.explorer-list` CSS, and all 12 `pastpaper-*` quiz entries from `quizzes.json` (back down to the original 9 quizzes: 3 History, 1 Geography, 5 Islamiyat). The 74 source PDFs + her own markdown conversions are still sitting in `Past papers for pak studies/` untouched, in case this gets revisited with a real per-theme topic taxonomy and an attempt-then-reveal flow. `data/README.md`'s note about `topic`/`question_type` was updated to reflect this rather than promising an explorer "coming next."
**Settings (real, Supabase-backed):** the old "Demo only" fake form is gone. `student-settings.js` updates the real `students.name` column (needs the "Students can update own name" column-scoped policy in `student-settings.sql` — `grant update (name)`, not a blanket grant, so even a tampered request touching other columns is rejected outright) and refreshes `STUDENT.name` + the topnav via `applyIdentity()`. Email stays read-only — it's also the login ID, and Rameen decided self-service email changes aren't worth the added complexity for students (the teacher-managed Reset Password pattern already covers the "I'm locked out" case). Offline download quality is a genuine per-device preference with no server need, so it reuses the existing approved `swr_student` localStorage blob (`setDownloadQuality`/`getDownloadQuality` in `data.js`) rather than adding new storage — same reasoning as the download-toggle exception already documented above.

**Weekly Test (`weekly` view, renders into `#weeklyArea`):** deadline card with computed days-left chip, PDF download link, numbered submission instructions — all from `current.json`. Deliberately NO upload UI; submissions happen on WhatsApp.

**Interactions (event delegation on `document`):** `[data-subject-btn]` / `[data-chapter-btn]` drill nav · `[data-quiz-start]` / `[data-quiz-exit]` / `.q-opt` / `[data-q-next]` / `[data-q-reveal]` / `[data-self-mark]` quiz flow · `.play-demo` toast · `.dl-btn` toast · `.fb-toggle` feedback row expand · `.switch-input` change → `.on` class + `setDownloaded()` + toast · settings submit toast. Rendering uses an `esc()` helper with template literals.

---

## CSS Section Map (`style.css`)

Sections are delimited by `/* === SECTION NAME === */` comments. Current sections in order:
1. Reset & root variables
2. Typography base
3. Buttons (`.btn`, `.btn-primary`, `.btn-outline`, `.btn-sm`, `.btn-block`)
4. Top nav (`.topnav`, `.brand`, `.brand-text`, `.topnav-right`, `.icon-btn`, `.badge`, `.user-chip`, `.avatar-initials`)
5. Cohort bar (`.cohort-bar` — sticky, `top: 64px` directly under the topnav, `z-index: 60` so it renders over the sidebar — `.cohort-pills`, `.pill`, `.pill.active`, `.cohort-meta`)
6. Layout (`.layout` — 230px sidebar + flex content area)
7. Sidebar (`.sidebar` — sticky `top: 136px` to clear the topnav+cohort-bar stack; `max-height: calc(100vh - 152px)` + flex column with `.snav` as the internal scroll area, so the sidebar is never taller than its sticky window — see the sticky-bug note under Pending Work for why. Sticky z-index stack: topnav 70 > cohort-bar 60 > sidebar 50. `.snav`, `.snav-item`, `.snav-item.active`, `.snav-sep`)
8. Page head (`.page-head`, `#viewTitle`)
9. Stats grid (`.stats`, `.stat-card`, `.stat-icon`, `.stat-value`, `.stat-label`, `.stat-sub`)
10. Panels (`.panel`, `.panel-head`, `.panel-hint`, `.panel-tools`, `.tool-select`)
11. Upload manager (`.upload-grid`, `.upload-item`, `.file-chip`, `.u-info`, `.u-kind`, `.kebab`)
12. Data tables — shared by Students roster, Assignments marking queue, My Grades (`.sub-table`, `.student-cell`, `.status-pill.ontime`, `.status-pill.late`, `.new-tag`)
13. Dashboard two-col (`.two-col`, `.jump`)
14. Content date hint (`.date-hint` — used by the Upload Notes/Lectures forms and the Roster's password-generate hint)
15. Scoreboard podium (`.podium`, `.podium-col.first/.second/.third`, `.podium-bar`, `.podium-name`, `.score-note`)
16. Settings form (`.settings-form`)
17. Gateway page (`.gateway-body`, `.gateway-card`, `.gw-actions`, `.gw-sub`, `.soon-tag`)
18. Student portal components (`.cohort-label`, `.welcome-banner`, `.stats.three`, `.lecture-grid`, `.lecture-card`, `.switch` + `.switch.on`, `.cat-tag`, `.grade-chip`, `.feedback-row`, `.rank-callout`, `.you-tag`)
19. Student drill-down nav (`.subject-grid`, `.subject-card`, `.chapter-list`, `.ch-item`, `.ch-body` expand, `.note-grid`, `.note-card`, `.chapter-hint`)
20. Student dashboard widgets (`.ring-grid`, `.ring-fill` + `ring-in` keyframe, `.podium.mini`, `.ann-list`, `.ann-item`)
21. Quiz engine & weekly test (`.quiz-card`, `.quiz-progress`, `.q-card`, `.q-opt.right/.wrong`, `.model-answer`, `.self-mark`, `.btn-success`, `.quiz-result`, `.screenshot-note`, `.deadline-card`, `.days-left`, `.instr-list`)
22. Gateway entrance & typing (`gw-card-in`/`gw-logo-in`/`gw-rise` keyframes, `.gw-caret`, `.gw-line2`)
23. Study-buddy owl easter egg (`.swr-owl`, `.owl-fly`, `.owl-twig`, `.owl-bubble`, flap/blink/hop/land keyframes)
24. Motion & interaction polish (`view-in` / `pop-in` / `indicator-in` keyframes, `prefers-reduced-motion` guard)
25. Responsive breakpoints (1100px / 900px / 640px / 520px)

---

## Code Guidelines

- **No framework, no build step.** Plain HTML, CSS, JS only.
- **No comments** unless the WHY is non-obvious. Never explain what the code does.
- **Single CSS file.** Add new component classes to `style.css` with a section comment. Never create per-page CSS.
- **Data-driven rendering.** Push to the shared JS arrays; call the matching `render*()` function. Never manually mutate DOM text outside a render function.
- **Toast pattern:** Use a `showToast(msg)` helper (already in teacher.js) that appends a `.toast` div, animates in, and removes itself after ~2.5 s.
- **No future-date uploads.** The content-date picker must always have `max` set to today's ISO date string.
- **Scoreboard shows rank only** — never raw marks or percentage scores. The podium shows 1st/2nd/3rd by name; the student view shows "Your rank: #N" visible only to that student.
- **Green is never decorative.** If it's not a success, live, highlight, or on state, use red or neutral.
- **Data is in-memory** except the student's download/watched state (localStorage `swr_student` — approved exception). Do not add other storage unless explicitly requested.
- **No backwards-compat hacks.** If something is unused, delete it. Don't leave `// removed` comments.

---

## Pending Work (as of 2026-07-22)

**Sticky header/sidebar bug — fully fixed 2026-07-25 (two rounds).** Rameen reported the student sidebar "going up" / overlapping the header on scroll; teacher portal fine. **Round 1** made `.cohort-bar` sticky (`top: 64px`) — it had been a non-sticky bar sandwiched between the sticky topnav and sticky sidebar — and bumped `.sidebar` `top` 88→126 to clear it. That helped but did NOT fully fix it. **Round 2 found the true root cause** (only reproducible with SHORT page content, which every earlier test had missed by using tall filler): the 9-item student sidebar (~467px) is taller than the content on short pages (Dashboard, Practice Quizzes), so the CSS grid `.layout` collapses to ≈ the sidebar's own height, leaving the sticky sidebar almost **zero travel room** → it scrolls up 1:1 with the page and slides over the header. The teacher sidebar (7 items, shorter) mostly escaped this. Real fix: **cap the sidebar to the viewport** (`max-height: calc(100vh - 152px)`, `display:flex; flex-direction:column; align-self:start`) and make `.snav` the internal scroll region (`flex:1 1 auto; min-height:0; overflow-y:auto`) — so the sidebar is never taller than its sticky window and always has somewhere to stick; when a very short window can't fit all nav items, the nav scrolls internally instead of the sidebar sliding. `.sidebar` keeps `overflow: visible` so the owl's cross-screen flight isn't clipped (only `.snav` scrolls). Also reordered the sticky z-index stack to topnav 70 > cohort-bar 60 > sidebar 50, so any residual sub-pixel graze at the extreme bottom of a very short window is covered by the cohort bar rather than showing over it. Verified via isolated reproduction sweeping every scroll position across tall/short content × normal(720)/short(450) viewports: no topnav overlap in any regime, nav always reachable. Applies to both portals (shared CSS). See memory [[feedback-sticky-layout-debug]] for the debugging lesson.

**Confirmed working by Rameen this session:** Phase 2 (Scoreboard + My Grades, including the equal-thirds weighting switch) and Phase 3 (teacher Student Report page, then extended to a matching chart/zones/progress-bars upgrade on the student's own My Grades page).

**Teacher Settings and Student Settings are both real now** — SQL run and end-to-end tested by Rameen 2026-07-22 (`teacher-settings.sql`, `student-settings.sql`). Confirmed working.

**All 4 progress-system phases are built and working.** Phase 4 (Attendance) SQL run + used by Rameen 2026-07-22, confirmed. The 2026-07-22 dashboard rebuild (`teacher-dashboard.js`) is confirmed working by Rameen (2026-07-26) — widgets populate correctly.

**Practice Quiz tracking — built 2026-07-25, SQL run + end-to-end tested by her 2026-07-26.** Confirmed working — quiz attempts save and show up on the teacher Student Report page.

**Single-device login enforcement — built 2026-07-26, SQL run by her.** Students only (scoped via 2 questions: students-only not teacher, "new login kicks the old device" not "block the new login"). New table `active_sessions` (`supabase/migrations/single-device-login.sql`, one row per student, RLS: student manages only their own row) holds a random token; `session-guard.js` (new shared module) writes a fresh token there + to this device's localStorage on every successful sign-in (`login.js`) and student-side password-reset completion (`update-password.js`, teacher branch untouched). `auth-guard.js` checks the local token against the database row on every page load and every 30s + on tab-focus while the app stays open (`verifySession`/`startSessionWatch`) — a mismatch means a newer login happened elsewhere, so this device is immediately signed out and bounced to `login.html?reason=elsewhere`, which shows "You've been signed out because your account was signed in on another device." Explicit logout also clears the local token (`clearLocalToken`). **Heads-up for her:** the first time any already-logged-in student loads the portal after this SQL is run, they'll be logged out once (no token exists yet for their device) — a one-time, expected inconvenience while the feature bootstraps, not a bug. **End-to-end testing (logging in on two real devices) is blocked on real hosting** (item 4 below) — she said she'll test once the site is actually deployed, since testing this meaningfully needs two separate real sessions, not a local dev link.

**Open decisions:**
1. ~~Should Late count toward attendance %~~ — **resolved 2026-07-23**: "Late" renamed to "Leave" everywhere (an excused absence), and it's now excluded from the attendance % calculation entirely (neither numerator nor denominator) rather than counted as attended. See `supabase/migrations/attendance-leave.sql`.
2. Needs-Attention thresholds: avg < 60% is **Rameen's confirmed choice** (2026-07-22); attendance < 67% is **confirmed as-is** (2026-07-23, she said "you don't need to change anything").
3. ~~Video lectures~~ — **built 2026-07-23, SQL run + end-to-end tested by her 2026-07-26**: real, Google Drive-backed (not YouTube — she already has lectures on Drive). Confirmed working.
4. ~~Real hosting decision~~ — **resolved 2026-07-27**: deployed to Netlify (free tier), live at `https://studywithrameenlms.netlify.app`. Code pushed via GitHub (`rameenasad066-dotcom/LMS-portal`, `main` branch) — Netlify can be connected to that repo for auto-deploy on push, or she can keep re-uploading the folder manually. `Past papers for pak studies/`, `source-notes/`, and other non-site source material are excluded via `.gitignore` so they aren't publicly served.

**In progress:**
5. Past-paper explorer — **built 2026-07-26, then removed 2026-07-27 at her request** (see bullet above for why: topic tags didn't actually merge recurring themes across years, and there was no attempt-before-reveal gate). She's deferring "past paper thinking" to later, not abandoning it — the 74 source PDFs + her own markdown conversions are still in `Past papers for pak studies/` for whenever she wants to revisit it with a real per-theme taxonomy and a proper attempt flow. Current priority is just getting the existing Practice Quizzes live.
6. ~~Step 4 — single-device login enforcement~~ — **built 2026-07-26, SQL run by her**. Hosting is now live (item 4 above) — end-to-end test (log in on two real devices, confirm the first gets signed out) is doable now, just not yet done.

**Housekeeping, low priority:**
7. ~~Likely-dead `.u-kind.backdated` CSS~~ — **done 2026-07-26**: confirmed unused (grepped every HTML/JS file — only the base `.u-kind` class is referenced, never `.backdated`; `.date-hint` in the same CSS section IS still used, so it was kept) and deleted from `style.css`. The stale CSS Section Map comment (§14) claiming it was "still used by the dashboard's legacy Recent Uploads demo list" was also fixed — that demo list was already removed in the 2026-07-22 dashboard rebuild.
8. Supabase dashboard hardening — two separate pieces: (a) ~~leaked-password-protection toggle~~ — **checked 2026-07-27: not available**, it's a Supabase Pro-plan feature and her project is on the free tier; skipped, not a launch blocker (bumped "Minimum password length" from 6→8 instead, which is free); (b) ~~tightening Edge Function CORS~~ — **done + deployed 2026-07-27**: both `create-student` and `reset-student-password` now check the request's `Origin` header against an allowlist (the Netlify domain + `localhost:5501`/`5500`) instead of `Access-Control-Allow-Origin: *`. She's confirmed both functions are redeployed with the new code.
9. ~~Supabase Redirect URLs~~ — **confirmed done 2026-07-27**: she added the Netlify domain to Site URL + Redirect URLs in Supabase Authentication settings. Password reset should now work correctly in production.
9. ~~Leftover throwaway Supabase test accounts~~ — **done 2026-07-26**: she ran a SELECT to confirm the exact 5 accounts (`swr.verify.*`, `swr.notateacher.*`, `swr.rejcheck.*`, `swr.rlscheck.*`, `swr.claude.test.*`, all created 2026-07-16/17), then deleted them via Authentication → Users in the Supabase dashboard. `auth.users` is clean.

**Content prep, hers not code:**
10. ~~Replace placeholder quiz questions~~ — **all real now (2026-07-26)**: History (3 quizzes), Geography (1 quiz), and Islamiyat (5 quizzes — Prayer, Hajj, Zakat, Fasting, Angels) are all drafted from her own notes into `data/quizzes.json`. **Islamiyat still needs her religious-accuracy review before it's considered final** — flag this until she confirms. Replace placeholder owl facts in `data/owl-facts.json`, drop the real weekly-test PDF into `tests/` (guide: `data/README.md`) are still outstanding.
