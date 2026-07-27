/* Study With Rameen · Student Portal
   All views render from data.js arrays — same pattern as teacher.js.
   Event delegation handles dynamically rendered content. */

/* ---------- Icons ---------- */

const ICO = {
  pdf:   '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  play:  '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  chev:  '<svg class="ch-chev" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ---------- Router ---------- */

const VIEW_TITLES = {
  dashboard:  'Dashboard',
  vault:      'Lecture Vault',
  notes:      'Notes',
  quiz:       'Practice Quizzes',
  weekly:     'Weekly Test',
  assignments: 'Assignments & Homework',
  grades:     'My Grades',
  scoreboard: 'Scoreboard',
  settings:   'Settings',
};

const $ = (id) => document.getElementById(id);

function showView() {
  let view = (location.hash || '#dashboard').slice(1);
  if (!VIEW_TITLES[view]) view = 'dashboard';
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.dataset.view !== view; });
  document.querySelectorAll('.snav-item[data-view]').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  $('viewTitle').textContent = VIEW_TITLES[view];
}

window.addEventListener('hashchange', showView);

/* ---------- Toast ---------- */

let _toastTimer;
function showToast(title, msg) {
  const t = $('toast');
  $('toastTitle').textContent = title;
  $('toastMsg').textContent = msg || '';
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Render: date subtitle ---------- */

function renderDate() {
  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  $('todaySub').textContent = `${dateStr} · ${STUDENT.cohortName} cohort`;
}

/* Called by auth-guard.js once the signed-in student's real profile has
   loaded from Firestore, to replace the demo STUDENT values shown in the
   chrome (topnav, cohort bar, settings form). */
function applyIdentity() {
  document.querySelectorAll('.topnav .avatar-initials').forEach((el) => { el.textContent = STUDENT.initials; });
  const chipName = document.querySelector('.topnav .user-chip-name');
  if (chipName) chipName.textContent = STUDENT.name;
  const cohortPill = $('cohortPillLabel');
  if (cohortPill) cohortPill.textContent = STUDENT.cohortName;
  const setName = $('setName');
  if (setName) setName.value = STUDENT.name;
  const setEmail = $('setEmail');
  if (setEmail) setEmail.value = STUDENT.email;
  renderDate();
}

/* ---------- Render: dashboard ---------- */

function renderDashboard() {
  renderRings();
  renderQuoteBanner();
}

function renderRings() {
  const grid = document.querySelector('[data-list="rings"]');
  if (!grid) return;

  const R = 40;
  const C = 2 * Math.PI * R;

  grid.innerHTML = SUBJECTS.map(s => {
    const p = subjectProgress(s.id);
    const off = (C * (1 - p.pct / 100)).toFixed(1);
    const done = p.pct === 100;
    return `
    <div class="ring-card ${done ? 'complete' : ''}">
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="ring-track" cx="50" cy="50" r="${R}"/>
          <circle class="ring-fill" cx="50" cy="50" r="${R}"
                  stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off}"
                  style="--circ:${C.toFixed(1)}"/>
        </svg>
        <span class="ring-pct">${p.pct}<small>%</small></span>
      </div>
      <strong class="ring-name">${esc(s.name)}</strong>
      <small class="ring-sub">${done ? 'Complete ✓' : `${p.done} of ${p.total} lectures watched`}</small>
    </div>`;
  }).join('');
}

/* ---------- Render: subject → chapter drill-down (vault & notes) ---------- */

const drill = {
  vault: { subject: null, chapter: null, subChapter: null },
  notes: { subject: null, chapter: null, subChapter: null },
};

function lectureCardHTML(l) {
  const subj = SUBJECTS.find(s => s.id === l.subject);
  return `
  <article class="lecture-card" data-id="${l.id}">
    <div class="lec-thumb">
      <span class="subject-chip">${esc(subj ? subj.name : '')}</span>
      ${l.isNew ? '<span class="new-tag">NEW</span>' : ''}
      <button class="play-btn" aria-label="Play lecture">${ICO.play}</button>
      <span class="duration">${esc(l.duration)}</span>
    </div>
    <div class="lec-body">
      <h3>${esc(l.title)}</h3>
      <p class="lec-meta">
        <span class="lec-date">${fmtDate(l.date)}</span>
        ${isWatched(l.id) ? `<span class="watched">${ICO.check}Watched</span>` : ''}
      </p>
      <label class="dl-row">
        <span class="dl-label">Download for offline</span>
        <input type="checkbox" class="switch-input" hidden ${isDownloaded(l.id) ? 'checked' : ''}>
        <span class="switch ${isDownloaded(l.id) ? 'on' : ''}" aria-hidden="true"></span>
      </label>
    </div>
  </article>`;
}

function noteCardHTML(n) {
  return `
  <article class="note-card">
    <span class="file-chip">${ICO.pdf}</span>
    <span class="note-info">
      <strong>${esc(n.title)}</strong>
      <small>PDF · ${esc(n.size)} · ${fmtDate(n.date)}</small>
    </span>
    <span class="cat-tag">${esc(n.cat)}</span>
    <button class="btn btn-download btn-sm dl-btn" data-id="${n.id}">Download</button>
  </article>`;
}

/* A top-level chapter either holds items directly, or (if it has
   sub-chapters) holds them via its sub-chapters — never both. */
function chapterItems(chapterId, arr) {
  const subs = CHAPTERS.filter(sc => sc.parentId === chapterId);
  if (!subs.length) return arr.filter(x => x.chapter === chapterId);
  return subs.flatMap(sub => arr.filter(x => x.chapter === sub.id));
}

function renderDrill(view) {
  const isVault = view === 'vault';
  const arr     = isVault ? LECTURES : NOTES;
  const unit    = isVault ? 'lecture' : 'PDF';
  const subEl   = document.querySelector(`[data-subjects="${view}"]`);
  const chEl    = document.querySelector(`[data-chapters="${view}"]`);
  if (!subEl || !chEl) return;

  const st = drill[view];

  subEl.innerHTML = SUBJECTS.map(s => {
    const n = arr.filter(x => x.subject === s.id).length;
    return `
    <button class="subject-card ${st.subject === s.id ? 'active' : ''}" data-subject-btn="${s.id}">
      <span class="subject-glyph">${esc(s.name[0])}</span>
      <span class="subject-info">
        <strong>${esc(s.name)}</strong>
        <small>${esc(s.paper)}</small>
      </span>
      <span class="subject-count">${n} ${unit}${n === 1 ? '' : 's'}</span>
    </button>`;
  }).join('');

  if (!st.subject) {
    chEl.innerHTML = `<div class="chapter-hint">Choose a subject above to browse its chapters${isVault ? ' and lectures' : ' and resources'}.</div>`;
    return;
  }

  const chapters = CHAPTERS.filter(c => c.subject === st.subject && !c.parentId && chapterItems(c.id, arr).length);
  chEl.innerHTML = '<div class="chapter-list">' + chapters.map((c, i) => {
    const subs = CHAPTERS.filter(sc => sc.parentId === c.id);
    const items = chapterItems(c.id, arr);
    const open  = st.chapter === c.id;

    const bodyHTML = subs.length
      ? '<div class="sub-chapter-list">' + subs
          .filter(sub => arr.some(x => x.chapter === sub.id))
          .map((sub, j) => {
            const subItems = arr.filter(x => x.chapter === sub.id);
            const subOpen = st.subChapter === sub.id;
            return `
          <div class="sub-ch-item ${subOpen ? 'open' : ''}">
            <button class="sub-ch-row" data-subchapter-btn="${sub.id}" aria-expanded="${subOpen}">
              <span class="ch-idx">${String(j + 1).padStart(2, '0')}</span>
              <span class="ch-title">${esc(sub.title)}</span>
              <span class="ch-count">${subItems.length} ${unit}${subItems.length === 1 ? '' : 's'}</span>
              ${ICO.chev}
            </button>
            <div class="sub-ch-body">
              <div class="sub-ch-body-inner">
                <div class="${isVault ? 'lecture-grid' : 'note-grid'}">
                  ${subItems.map(isVault ? lectureCardHTML : noteCardHTML).join('')}
                </div>
              </div>
            </div>
          </div>`;
          }).join('') + '</div>'
      : `<div class="${isVault ? 'lecture-grid' : 'note-grid'}">${items.map(isVault ? lectureCardHTML : noteCardHTML).join('')}</div>`;

    return `
    <div class="ch-item ${open ? 'open' : ''}">
      <button class="ch-row" data-chapter-btn="${c.id}" aria-expanded="${open}">
        <span class="ch-idx">${String(i + 1).padStart(2, '0')}</span>
        <span class="ch-title">${esc(c.title)}</span>
        <span class="ch-count">${items.length} ${unit}${items.length === 1 ? '' : 's'}</span>
        ${ICO.chev}
      </button>
      <div class="ch-body">
        <div class="ch-body-inner">
          ${bodyHTML}
        </div>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function renderVault() { renderDrill('vault'); }
function renderNotes() { renderDrill('notes'); }

/* ---------- Render: practice quizzes ---------- */

let quizState = null;

function renderQuizList() {
  const area = $('quizArea');
  if (!area) return;
  quizState = null;
  area.innerHTML = QUIZZES.map(q => {
    const s = SUBJECTS.find(x => x.id === q.subject);
    const mcq = q.questions.filter(x => x.question_type === 'mcq').length;
    const sa  = q.questions.length - mcq;
    return `
    <div class="quiz-card">
      <span class="subject-glyph">${esc(s ? s.name[0] : '?')}</span>
      <span class="quiz-info">
        <strong>${esc(q.title)}</strong>
        <small>${esc(s ? s.name : '')} · ${q.questions.length} questions · ${mcq} MCQ + ${sa} short answer</small>
      </span>
      <button class="btn btn-primary btn-sm" data-quiz-start="${esc(q.id)}">Start quiz</button>
    </div>`;
  }).join('');
}

function renderQuizQuestion() {
  const area = $('quizArea');
  const { quiz, i } = quizState;
  const q = quiz.questions[i];
  const total = quiz.questions.length;
  const isMcq = q.question_type === 'mcq';
  area.innerHTML = `
    <div class="quiz-top">
      <button class="btn btn-outline btn-sm" data-quiz-exit>← All quizzes</button>
      <span class="quiz-step">Question ${i + 1} of ${total}</span>
    </div>
    <div class="quiz-progress"><span style="width:${Math.round((i / total) * 100)}%"></span></div>
    <div class="q-card">
      <span class="q-type ${isMcq ? '' : 'sa'}">${isMcq ? 'Multiple choice' : 'Short answer · self-marked'}</span>
      <h3 class="q-text">${esc(q.question)}</h3>
      ${isMcq ? `
      <div class="q-opts">
        ${q.options.map((o, oi) => `<button class="q-opt" data-opt="${oi}">${esc(o)}</button>`).join('')}
      </div>
      <div class="q-actions" hidden>
        <button class="btn btn-primary" data-q-next>${i + 1 === total ? 'See my result' : 'Next question →'}</button>
      </div>` : `
      <textarea class="q-input" rows="3" placeholder="Type your answer first (optional), then reveal the model answer."></textarea>
      <div class="q-actions">
        <button class="btn btn-primary" data-q-reveal>Reveal model answer</button>
      </div>
      <div class="model-answer" hidden>
        <strong>Model answer</strong>
        <ul>${(q.model_answer || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        ${q.marking_note ? `<small class="mark-note">${esc(q.marking_note)}</small>` : ''}
        <div class="self-mark">
          <span>Be honest — did you get it?</span>
          <button class="btn btn-success btn-sm" data-self-mark="1">I got it right</button>
          <button class="btn btn-outline btn-sm" data-self-mark="0">I got it wrong</button>
        </div>
      </div>`}
    </div>`;
}

function advanceQuiz() {
  quizState.i++;
  quizState.answered = false;
  if (quizState.i >= quizState.quiz.questions.length) renderQuizResult();
  else renderQuizQuestion();
}

function renderQuizResult() {
  const { quiz, score, answers } = quizState;
  const total = quiz.questions.length;
  const pct = Math.round((score / total) * 100);
  const R = 40;
  const C = 2 * Math.PI * R;
  $('quizArea').innerHTML = `
    <div class="quiz-result">
      <div class="ring-card ${pct === 100 ? 'complete' : ''}">
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle class="ring-track" cx="50" cy="50" r="${R}"/>
            <circle class="ring-fill" cx="50" cy="50" r="${R}"
                    stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"
                    style="--circ:${C.toFixed(1)}"/>
          </svg>
          <span class="ring-pct">${score}<small>/${total}</small></span>
        </div>
      </div>
      <h3>${esc(quiz.title)}</h3>
      <p class="quiz-score-line">You scored ${score} out of ${total}${pct === 100 ? ' — perfect! 🎉' : score >= Math.ceil(total * 0.6) ? ' — well done!' : ' — keep practising!'}</p>
      <p class="screenshot-note">✓ Saved to your practice history — Miss Rameen can see this on your report.</p>
      <div class="quiz-result-actions">
        <button class="btn btn-primary" data-quiz-start="${esc(quiz.id)}">Retake quiz</button>
        <button class="btn btn-outline" data-quiz-exit>All quizzes</button>
      </div>
    </div>`;
  if (window.saveQuizAttempt) window.saveQuizAttempt({ quiz, score, answers });
  quizState = null;
}

/* ---------- Render: quote-of-the-day banner ---------- */

function renderQuoteBanner() {
  const q = quoteOfTheDay();
  const textEl = $('hpQuoteText');
  const speakerEl = $('hpQuoteSpeaker');
  if (!q || !textEl || !speakerEl) return;
  textEl.textContent = `"${q.text}"`;
  speakerEl.textContent = `— ${q.speaker}`;
}

/* ---------- Render all ---------- */

function renderAll() {
  renderDate();
  renderDashboard();
  renderVault();
  renderNotes();
  renderQuizList();
}

/* ==========================================================================
   Event delegation — works for dynamically rendered content
   ========================================================================== */

document.addEventListener('click', e => {
  const sBtn = e.target.closest('[data-subject-btn]');
  if (sBtn) {
    const view = sBtn.closest('.view').dataset.view;
    const st = drill[view];
    if (st.subject !== sBtn.dataset.subjectBtn) {
      st.subject = sBtn.dataset.subjectBtn;
      st.chapter = null;
      renderDrill(view);
    }
    return;
  }

  const cBtn = e.target.closest('[data-chapter-btn]');
  if (cBtn) {
    const view = cBtn.closest('.view').dataset.view;
    const st = drill[view];
    const id = cBtn.dataset.chapterBtn;
    const item = cBtn.closest('.ch-item');
    if (st.chapter === id) {
      st.chapter = null;
      st.subChapter = null;
      item.classList.remove('open');
      cBtn.setAttribute('aria-expanded', 'false');
    } else {
      st.chapter = id;
      st.subChapter = null;
      item.parentElement.querySelectorAll('.ch-item.open').forEach(x => {
        x.classList.remove('open');
        x.querySelector('.ch-row').setAttribute('aria-expanded', 'false');
      });
      item.classList.add('open');
      cBtn.setAttribute('aria-expanded', 'true');
    }
    return;
  }

  const scBtn = e.target.closest('[data-subchapter-btn]');
  if (scBtn) {
    const view = scBtn.closest('.view').dataset.view;
    const st = drill[view];
    const id = scBtn.dataset.subchapterBtn;
    const item = scBtn.closest('.sub-ch-item');
    if (st.subChapter === id) {
      st.subChapter = null;
      item.classList.remove('open');
      scBtn.setAttribute('aria-expanded', 'false');
    } else {
      st.subChapter = id;
      item.parentElement.querySelectorAll('.sub-ch-item.open').forEach(x => {
        x.classList.remove('open');
        x.querySelector('.sub-ch-row').setAttribute('aria-expanded', 'false');
      });
      item.classList.add('open');
      scBtn.setAttribute('aria-expanded', 'true');
    }
    return;
  }

  const qStart = e.target.closest('[data-quiz-start]');
  if (qStart) {
    const quiz = QUIZZES.find(x => x.id === qStart.dataset.quizStart);
    if (quiz) {
      quizState = { quiz, i: 0, score: 0, answered: false, answers: [] };
      renderQuizQuestion();
    }
    return;
  }

  if (e.target.closest('[data-quiz-exit]')) {
    renderQuizList();
    return;
  }

  const opt = e.target.closest('.q-opt');
  if (opt && quizState && !quizState.answered) {
    const q = quizState.quiz.questions[quizState.i];
    const pick = +opt.dataset.opt;
    quizState.answered = true;
    const isCorrect = pick === q.correct;
    if (isCorrect) quizState.score++;
    quizState.answers.push({
      topic: q.topic,
      question_type: 'mcq',
      question: q.question,
      correct: isCorrect,
      picked: q.options[pick],
      correctOption: q.options[q.correct],
    });
    opt.parentElement.querySelectorAll('.q-opt').forEach((b, bi) => {
      b.disabled = true;
      if (bi === q.correct) b.classList.add('right');
      else if (bi === pick) b.classList.add('wrong');
    });
    const area = $('quizArea');
    area.querySelector('.q-actions').hidden = false;
    area.querySelector('.quiz-progress span').style.width =
      `${Math.round(((quizState.i + 1) / quizState.quiz.questions.length) * 100)}%`;
    return;
  }

  if (e.target.closest('[data-q-next]')) {
    advanceQuiz();
    return;
  }

  if (e.target.closest('[data-q-reveal]')) {
    const area = $('quizArea');
    area.querySelector('.model-answer').hidden = false;
    area.querySelector('[data-q-reveal]').closest('.q-actions').hidden = true;
    area.querySelector('.quiz-progress span').style.width =
      `${Math.round(((quizState.i + 1) / quizState.quiz.questions.length) * 100)}%`;
    return;
  }

  const selfMark = e.target.closest('[data-self-mark]');
  if (selfMark) {
    const q = quizState.quiz.questions[quizState.i];
    const isCorrect = selfMark.dataset.selfMark === '1';
    if (isCorrect) quizState.score++;
    const textarea = $('quizArea').querySelector('.q-input');
    quizState.answers.push({
      topic: q.topic,
      question_type: 'short_answer',
      question: q.question,
      correct: isCorrect,
      typedAnswer: textarea ? textarea.value.trim() : '',
    });
    advanceQuiz();
    return;
  }

  if (e.target.closest('.play-btn')) {
    const card = e.target.closest('[data-id]');
    const lec  = card && LECTURES.find(l => l.id === card.dataset.id);
    if (lec && lec.url) {
      window.open(lec.url, '_blank', 'noopener');
      if (!isWatched(lec.id)) {
        setWatched(lec.id, true);
        renderVault();
        renderDashboard();
      }
    } else {
      showToast('Video coming soon', 'This lecture will be uploaded to YouTube shortly.');
    }
    return;
  }

  const dlBtn = e.target.closest('.dl-btn');
  if (dlBtn) {
    downloadNote(dlBtn.dataset.id);
    return;
  }

  const fbBtn = e.target.closest('.fb-toggle');
  if (fbBtn) {
    const fbRow = fbBtn.closest('tr').nextElementSibling;
    if (fbRow && fbRow.classList.contains('feedback-row')) {
      const opening = fbRow.hidden;
      fbRow.hidden = !opening;
      fbBtn.textContent = opening ? 'Hide feedback' : 'View feedback';
    }
    return;
  }
});

document.addEventListener('change', e => {
  const input = e.target.closest('.switch-input');
  if (!input) return;
  const switchEl = input.nextElementSibling;
  if (switchEl) switchEl.classList.toggle('on', input.checked);
  const card = input.closest('[data-id]');
  if (card) setDownloaded(card.dataset.id, input.checked);
  showToast(
    input.checked ? 'Saved for offline study'     : 'Removed from offline library',
    input.checked ? 'Available without internet.' : 'Download deleted to free up space.'
  );
});


/* ---------- Init ---------- */

document.addEventListener('DOMContentLoaded', () => {
  showView();
  loadData()
    .then(renderAll)
    .catch(() => showToast('Content failed to load', 'Check that the files in data/ are valid JSON.'));
});
