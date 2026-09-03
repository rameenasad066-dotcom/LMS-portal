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
  renderFactBanner();
}

function renderRings() {
  const grid = document.querySelector('[data-list="rings"]');
  if (!grid) return;

  const R = 40;
  const C = 2 * Math.PI * R;

  grid.innerHTML = enrolledSubjects().map(s => {
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

  subEl.innerHTML = enrolledSubjects().map(s => {
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

/* ---------- Render: syllabus fact-of-the-day banner ---------- */

const FACT_TAG_LABEL = { tip: 'Examiner Tip', date: 'Key Date', fact: 'Syllabus Fact' };

function renderFactBanner() {
  const f = factOfTheDay();
  const tagEl = $('dashFactTag');
  const textEl = $('dashFactText');
  if (!f || !tagEl || !textEl) return;

  // The banner rotates a different subject each day, so name it — otherwise
  // a Geography fact on a History day reads as a mistake.
  const subject = SUBJECTS.find(s => s.id === f.subject);
  const kind = FACT_TAG_LABEL[f.tag] || 'Syllabus Fact';
  tagEl.textContent = subject ? `${subject.name} · ${kind}` : kind;
  textEl.textContent = f.text;
}

/* ---------- Render all ---------- */

function renderAll() {
  renderDate();
  renderDashboard();
  renderVault();
  renderNotes();
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

  if (e.target.closest('.play-btn')) {
    const card = e.target.closest('[data-id]');
    const lec  = card && LECTURES.find(l => l.id === card.dataset.id);
    if (lec && lec.url) {
      window.open(lec.url, '_blank', 'noopener');
      window.markWatched(lec.id);
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
