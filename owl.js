/* Study-buddy owl easter egg — a soft snowy owl sits pre-perched on load (no
   flight-in) and shares a study fact on click (syllabus facts, examiner tips,
   key dates from data/owl-facts.json; falls back to a few built-ins if that
   file can't load, so the owl is never silent). Self-contained: builds its
   own DOM, no portal-script dependencies. Perch spots: portals = in-flow at
   the sidebar's bottom (can never cover UI); gateway = the card's red top
   border. Palette: white/gray/ink feathers, big dark eyes, neutral beak &
   talons — never green. */

(function () {
  const FALLBACK_FACTS = [
    { tag: 'tip',  text: "Read the command word first: 'Describe' wants points, 'Explain' wants reasons." },
    { tag: 'date', text: 'Pakistan gained independence on 14 August 1947.' },
    { tag: 'fact', text: "The Indus is Pakistan's longest river and the lifeline of its irrigation system." },
  ];
  const TAG_ICON = { tip: '✍️', date: '📅', fact: '📖' };

  let FACTS = FALLBACK_FACTS;
  let order = [];
  let orderPos = 0;
  let lastText = '';

  function loadFacts() {
    return fetch('data/owl-facts.json')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => {
        const list = Array.isArray(data) ? data : data && data.facts;
        const clean = Array.isArray(list) ? list.filter(f => f && f.text) : [];
        if (clean.length) { FACTS = clean; order = []; }
      })
      .catch(() => {});
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextFact() {
    if (orderPos >= order.length) {
      order = shuffle(FACTS);
      if (order.length > 1 && order[0].text === lastText) order.push(order.shift());
      orderPos = 0;
    }
    const f = order[orderPos++];
    lastText = f.text;
    return f;
  }

  const WING_FOLD = `
      <path d="M21 40 Q15 47 18 58 Q22 63 25 56 Q22 47 26 41 Q24 38 21 40 Z"
            fill="#EDEAE3" stroke="#CFC9BE" stroke-width="1.3"/>
      <path d="M19.5 48 Q22.5 49 24.5 47 M19.5 53 Q22.5 54.5 25 52"
            fill="none" stroke="#CFC9BE" stroke-width="1.1"/>`;

  const MARKUP = `
  <svg class="owl-twig" viewBox="0 0 88 14" aria-hidden="true">
    <path d="M0 6 Q28 3 50 6.5 T88 8 L88 11 Q50 12.5 26 10.5 T0 10 Z" fill="#A89C8C"/>
    <path d="M58 6.5 q6 -4.5 12 -5.5" stroke="#A89C8C" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>
  <span class="owl-fly">
    <span class="owl-bob">
      <svg class="owl-svg" viewBox="0 0 72 72" aria-hidden="true">
        <path d="M30 57 Q36 70 42 57 Z" fill="#E3DFD7" stroke="#CFC9BE" stroke-width="1.2"/>
        <g class="wf">${WING_FOLD}</g>
        <g class="wf" transform="translate(72 0) scale(-1 1)">${WING_FOLD}</g>
        <ellipse cx="36" cy="48" rx="16" ry="16" fill="#FCFBF8" stroke="#CFC9BE" stroke-width="1.5"/>
        <g fill="none" stroke="#E4DFD6" stroke-width="1.5" stroke-linecap="round">
          <path d="M30 45 q2 2 4 0 M38 45 q2 2 4 0"/>
          <path d="M26 51 q2 2 4 0 M34 51 q2 2 4 0 M42 51 q2 2 4 0"/>
          <path d="M30 57 q2 2 4 0 M38 57 q2 2 4 0"/>
        </g>
        <path d="M23 13 Q20.5 5.5 25.5 6.5 Q28.5 9 27 14 Z" fill="#EDEAE3" stroke="#CFC9BE" stroke-width="1.2"/>
        <path d="M49 13 Q51.5 5.5 46.5 6.5 Q43.5 9 45 14 Z" fill="#EDEAE3" stroke="#CFC9BE" stroke-width="1.2"/>
        <circle cx="36" cy="24" r="17.5" fill="#FCFBF8" stroke="#CFC9BE" stroke-width="1.5"/>
        <g class="owl-eye">
          <circle cx="29.5" cy="25" r="7.4" fill="#2B2A28"/>
          <circle cx="31.7" cy="22.6" r="2.4" fill="#FFF"/>
          <circle cx="27.6" cy="27.4" r="1.1" fill="#FFF" opacity="0.85"/>
        </g>
        <g class="owl-eye">
          <circle cx="42.5" cy="25" r="7.4" fill="#2B2A28"/>
          <circle cx="44.7" cy="22.6" r="2.4" fill="#FFF"/>
          <circle cx="40.6" cy="27.4" r="1.1" fill="#FFF" opacity="0.85"/>
        </g>
        <path d="M36 31 Q33 31 33.6 34 Q34.6 36.6 36 36.6 Q37.4 36.6 38.4 34 Q39 31 36 31 Z"
              fill="#C7C1B6" stroke="#B0A99C" stroke-width="0.8"/>
        <g fill="#D9D3C9" stroke="#BEB7AA" stroke-width="0.8">
          <ellipse cx="31" cy="63.5" rx="1.8" ry="2.9"/>
          <ellipse cx="34.7" cy="64.2" rx="1.8" ry="3"/>
          <ellipse cx="38.3" cy="64.2" rx="1.8" ry="3"/>
          <ellipse cx="42" cy="63.5" rx="1.8" ry="2.9"/>
        </g>
      </svg>
    </span>
    <span class="owl-bubble" hidden></span>
  </span>`;

  function init() {
    loadFacts();

    const sidebar = document.querySelector('.sidebar');
    const portal = !!sidebar;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swr-owl ' + (portal ? 'portal' : 'gateway');
    btn.setAttribute('aria-label', 'A friendly owl — click for a study fact');
    btn.innerHTML = MARKUP;

    const host = portal ? sidebar : (document.querySelector('.gateway-card') || document.body);
    host.appendChild(btn);

    const bubble = btn.querySelector('.owl-bubble');

    btn.classList.add('still', 'perched');

    let timer;
    btn.addEventListener('click', () => {
      if (!btn.classList.contains('perched')) return;
      const f = nextFact();
      bubble.textContent = (TAG_ICON[f.tag] || '💡') + '  ' + f.text;
      bubble.hidden = false;
      btn.classList.remove('hop');
      void btn.offsetWidth;
      btn.classList.add('hop');
      clearTimeout(timer);
      timer = setTimeout(() => { bubble.hidden = true; }, 6000);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
