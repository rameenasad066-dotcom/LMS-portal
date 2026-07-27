# How to update the portal content (for Miss Rameen)

Everything in this folder is plain text you can edit with Notepad or VS Code.
After saving a file, just **refresh the portal in the browser** — changes appear immediately.

There are three files you'll edit:

| File | What it controls |
|---|---|
| `quizzes.json` | The practice quizzes |
| `current.json` | This week's test (PDF link, deadline, submission instructions) |
| `owl-facts.json` | The study facts the owl says when a student clicks it |

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

## 2. owl-facts.json — the owl's study facts

⚠️ **All the facts currently in this file are placeholders** — check them and replace them with your own.

When a student clicks the little owl, it shows one of these facts in a speech bubble.
Each fact is one line:

```json
{ "tag": "tip", "text": "Read the command word first: 'Describe' wants points, 'Explain' wants reasons." }
```

- `tag` — one of `fact`, `tip`, or `date`. It just picks the little icon shown before the text
  (`fact` = 📖, `tip` = ✍️, `date` = 📅). Anything else falls back to 💡.
- `text` — the fact itself. Keep it to one or two short sentences so it fits the bubble.
- Add a fact by copying a line, pasting it after the last one, and putting a comma between them
  (no comma after the last one).
- The owl picks facts in a shuffled order and never repeats the same one twice in a row.

If this file ever has a typo and can't load, the owl quietly falls back to a few built-in facts —
it won't break the page.

---

## 3. current.json — updating the weekly test

1. Create a folder called `tests` in the project root (next to `index.html`) if it doesn't exist.
2. Put this week's test PDF inside it, e.g. `tests/mock-test-5.pdf`.
3. Update `current.json`:

```json
"weekly_test": {
  "title": "Mock Test 5 — Paper 2 (Geography)",
  "pdf": "tests/mock-test-5.pdf",
  "deadline": "2026-07-19",
  "deadline_time": "11:59 PM",
  "instructions": [ ...one line per step... ]
}
```

- `deadline` must be in `YYYY-MM-DD` format — the portal computes "X days left" from it,
  and the deadline in the top cohort bar updates automatically too.
- There is deliberately **no upload button** — students submit on WhatsApp only.

---

## JSON survival tips

- Always use **double quotes** `"` — never single quotes.
- Put a **comma between** items in a list, but **no comma after the last one**.
- If the portal shows the toast *"Content failed to load"* after you edit,
  paste the file into **jsonlint.com** — it will point at the exact broken line.
