/* Shared grade-progress maths for the teacher Student Report
   (teacher-student-report.js), the student's My Grades page
   (student-grades.js) and the teacher dashboard's Needs Attention list
   (teacher-dashboard.js). One copy on purpose: the two report pages used to
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
