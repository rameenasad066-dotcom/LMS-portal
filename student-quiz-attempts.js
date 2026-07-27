/* Saves completed Practice Quiz attempts (student.html) to the real
   `quiz_attempts` table — previously results were never stored anywhere at
   all ("screenshot and send to Miss Rameen"). Deliberately isolated from
   `marks`/`assignments` — practice quizzes never affect a student's real
   grade, band, or average, only Rameen's visibility into who's practising.
   student.js (a classic script) can't `import` this module directly, so
   this attaches itself to `window` for student.js to call — same
   cross-script pattern as other window.* bridges in this project. */

import { supabase } from "./supabase-config.js";

export async function saveQuizAttempt({ quiz, score, answers }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("quiz_attempts").insert({
    student_id: user.id,
    quiz_id: quiz.id,
    quiz_title: quiz.title,
    subject: quiz.subject,
    score,
    total: quiz.questions.length,
    answers,
  });

  if (error) showToast("Couldn't save quiz result", error.message || "Please try again.");
}

window.saveQuizAttempt = saveQuizAttempt;
