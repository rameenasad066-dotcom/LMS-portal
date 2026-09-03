# How to update the portal content (for Miss Rameen)

Everything in this folder is plain text you can edit with Notepad or VS Code.
After saving a file, just **refresh the portal in the browser** — changes appear immediately.

There's one file you'll edit:

| File | What it controls |
|---|---|
| `owl-facts.json` | The study facts the owl says when clicked, **and** the dashboard's fact-of-the-day banner |

> The weekly test is no longer a file you edit — post it from the Teacher Portal's
> **Weekly Test** page instead (title, PDF upload, and the time uploads close). See CLAUDE.md
> for how the cutoff enforcement works.

> Subjects live in `content.json`, but you won't normally need to touch it. **Chapters and
> sub-chapters are no longer edited as a file at all** — create them directly in the Teacher
> Portal's Upload Notes page (Subject → "+ Add chapter" → optionally "+ Add sub-chapter" inside
> it). Lecture videos and PDF notes themselves are uploaded for real from the Teacher Portal too.

---

## owl-facts.json — the owl's study facts, and the dashboard banner

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
