# How to update the portal content (for Miss Rameen)

Everything in this folder is plain text you can edit with Notepad or VS Code.
After saving a file, just **refresh the portal in the browser** — changes appear immediately.

There are two files you'll edit:

| File | What it controls |
|---|---|
| `quizzes.json` | The practice quizzes |
| `owl-facts.json` | The study facts the owl says when clicked, **and** the dashboard's fact-of-the-day banner |

> The weekly test is no longer a file you edit — post it from the Teacher Portal's
> **Weekly Test** page instead (title, PDF upload, and the time uploads close). See CLAUDE.md
> for how the cutoff enforcement works.

> Subjects live in `content.json`, but you won't normally need to touch it. **Chapters and
> sub-chapters are no longer edited as a file at all** — create them directly in the Teacher
> Portal's Upload Notes page (Subject → "+ Add chapter" → optionally "+ Add sub-chapter" inside
> it). Lecture videos and PDF notes themselves are uploaded for real from the Teacher Portal too.

---

## 1. quizzes.json — adding or replacing a quiz

⚠️ **All the questions currently in this file are placeholders** — replace them with your own.

A quiz looks like this:

```json
{
  "id": "quiz-history-mughal-1",
  "subject": "history",
  "title": "Mughal Empire — Quick Check",
  "questions": [ ...5 question blocks... ]
}
```

Aim for **5 questions per quiz** — a mix of multiple choice and short answer.

**Multiple-choice question:**

```json
{
  "topic": "The Mughal Empire & Its Decline",
  "question_type": "mcq",
  "question": "Your question text here?",
  "options": ["First option", "Second option", "Third option", "Fourth option"],
  "correct": 0
}
```

- `correct` is the position of the right answer, **counting from 0** —
  so `0` = first option, `1` = second, `2` = third, `3` = fourth.

**Short-answer question** (self-marked — the student reveals your model answer and marks themselves):

```json
{
  "topic": "The Pakistan Movement (1927–1947)",
  "question_type": "short_answer",
  "question": "Name four reasons why …",
  "model_answer": [
    "Valid point 1",
    "Valid point 2",
    "Valid point 3",
    "Valid point 4",
    "Valid point 5",
    "Valid point 6"
  ],
  "marking_note": "Any four of these earn full credit."
}
```

- For **"name four points"** style questions, list **6–7 valid points**, not just 4 —
  that way every good answer a student writes is covered by your list.
- `marking_note` is optional; it shows under the model answer.

**Important:** every question should still keep its `topic` and `question_type` fields, even
though no feature currently reads `topic` (a past-paper explorer that browsed by topic was
built and then removed — see CLAUDE.md if you want the history). Keeping the field costs
nothing and leaves the door open if that idea comes back later.

Quiz results **are saved** — each attempt is stored automatically, and you can see a
student's practice quiz history (score + what they answered) on their Student Report page
in the teacher portal.

---

## 2. owl-facts.json — the owl's study facts, and the dashboard banner

⚠️ **All the facts currently in this file are placeholders** — check them and replace them with your own.

This one file feeds two places: when a student clicks the little owl it shows one of these facts
in a speech bubble, and the same list supplies the dashboard's fact-of-the-day banner.
Each fact is one line:

```json
{ "subject": "history", "tag": "date", "text": "The War of Independence broke out at Meerut in May 1857." }
```

- `subject` — one of `history`, `geography`, or `islamiyat`. **The dashboard shows one subject
  per day and rotates**, so a student who takes everything gets History one day, Geography the
  next, Islamiyat the next, and round again. A student who only takes one course only ever sees
  their own subjects.
- `tag` — one of `fact`, `tip`, or `date`. On the owl it picks the little icon shown before the
  text (`fact` = 📖, `tip` = ✍️, `date` = 📅, anything else falls back to 💡); on the dashboard
  banner it becomes the small label above the fact ("History · Key Date", "Islamiyat · Examiner
  Tip", and so on).
- `text` — the fact itself. Keep it to **one or two short sentences** — a single fact or figure,
  not a paragraph. It has to fit in a speech bubble and a banner.
- Add a fact by copying a line, pasting it after the last one, and putting a comma between them
  (no comma after the last one).
- The owl picks facts in a shuffled order and never repeats the same one twice in a row; the
  dashboard banner always shows the same one all day, based on the date.
- Adding more facts to a subject makes that subject's turn come round with fresh content for
  longer before it repeats.

If this file ever has a typo and can't load, the owl quietly falls back to a few built-in facts
and the dashboard banner just doesn't show — neither will break the page.

---

## JSON survival tips

- Always use **double quotes** `"` — never single quotes.
- Put a **comma between** items in a list, but **no comma after the last one**.
- If the portal shows the toast *"Content failed to load"* after you edit,
  paste the file into **jsonlint.com** — it will point at the exact broken line.
