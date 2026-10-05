/* Shared grade-progress + attendance maths for the teacher Student Report
   and Monthly PDF (teacher-student-report.js), the student's My Grades page
   (student-grades.js), the teacher dashboard's Needs Attention list
   (teacher-dashboard.js) and the scoreboard detail card
   (teacher-scoreboard.js). One copy on purpose: the two report pages used to
   order marks by different dates (due_date vs marked_at) and compute trend
   two different ways, so the same student could read "+50% from previous"
   on one and "Declining" on the other. */

// A trend inside ±3 points reads as noise, not movement.
const STEADY_BAND = 3;

function dayTs(isoDate) {
  return new Date(isoDate + "T00:00:00").getTime();
}

// Chronological = when the work was due, not when it happened to be marked —
// marking out of order (catching up on an old homework after a newer test)
// must not reshuffle a student's history. Ties on the same due date fall
// back to marking order so the result is stable between page loads.
// Items need `dueDate` (YYYY-MM-DD) and `markedAt` (ISO timestamp).
export function byChronology(a, b) {
  return dayTs(a.dueDate) - dayTs(b.dueDate) || new Date(a.markedAt) - new Date(b.markedAt);
}

// Latest graded item vs the one before it. `items` must already be sorted
// with byChronology and carry a whole-number `pct`.
export function trendFromPrevious(items) {
  if (items.length < 2) return null;
  const delta = items[items.length - 1].pct - items[items.length - 2].pct;
  const dir = delta > STEADY_BAND ? "up" : delta < -STEADY_BAND ? "down" : "same";
  return {
    delta,
    dir,
    label: dir === "up" ? "Improving" : dir === "down" ? "Declining" : "Steady",
    deltaText: `${delta >= 0 ? "+" : ""}${delta}% from previous`,
  };
}

// The one attendance rule, used by every page that shows a %. Only rows for
// a course the student is enrolled in count — a session for a subject they
// don't take (e.g. left over after dropping a course) is ignored, not
// counted as absent. Untagged legacy rows (subject null, marked before
// attendance-subjects.sql) always count. "Leave" is an excused absence:
// in neither numerator nor denominator. `enrolledCourses` is a list of
// course ids — callers pass coursesForSubjects(student.subjects).
export function attendanceSummary(rows, enrolledCourses) {
  const relevant = (rows || []).filter((r) => !r.subject || enrolledCourses.includes(r.subject));
  const present = relevant.filter((r) => r.status === "present").length;
  const absent = relevant.filter((r) => r.status === "absent").length;
  const leave = relevant.filter((r) => r.status === "leave").length;
  const counted = present + absent;
  return { present, absent, leave, counted, pct: counted ? Math.round((100 * present) / counted) : null };
}

// Same equal-thirds weighting as get_scoreboard(): average the per-category
// (homework/assignment/test) points-earned/points-possible %, skipping any
// category with nothing graded rather than counting it as 0%. Items need
// `type`, `marksVal`, `maxMarks`. Returns null when nothing is graded.
export function equalThirdsAvg(items) {
  const byType = {};
  items.forEach((it) => {
    if (!byType[it.type]) byType[it.type] = { earned: 0, possible: 0 };
    byType[it.type].earned += it.marksVal;
    byType[it.type].possible += it.maxMarks;
  });
  const categoryPcts = Object.values(byType)
    .filter((c) => c.possible > 0)
    .map((c) => (100 * c.earned) / c.possible);
  if (!categoryPcts.length) return null;
  return Math.round(categoryPcts.reduce((s, p) => s + p, 0) / categoryPcts.length);
}
