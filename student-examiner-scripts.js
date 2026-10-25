/* Examiner Scripts (student.html) — the cohort's marked scripts as grade-first
   cards (subject, marks, grade), and an in-portal PDF reader so nothing opens
   in another tab. Visibility is enforced by the database (see
   supabase/migrations/examiner-scripts.sql); the filters here only keep the
   teacher's preview ("view as a student") honest, since her account can read
   every cohort.

   The reader draws pages onto canvases with PDF.js (vendor/pdfjs, pinned
   3.11.174) instead of using the browser's own PDF viewer: Android Chrome,
   where most students are, doesn't render PDFs inside a page and offers a
   download instead. Pages render lazily as they scroll into view.
   Exported rather than self-running because it needs STUDENT.cohortId/subjects;
   auth-guard.js calls initExaminerScripts() once the profile has resolved. */

import { supabase, COURSES, coursesForItem, courseLabel } from "./supabase-config.js";

const BUCKET = "examiner-scripts";
const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5];
const MAX_PAGE_PIXELS = 12e6;
const COLS = "id, subjects, title, session, marks, max_marks, grade, pdf_path, created_at";

let scripts = [];
let loadError = "";
let courseFilter = "all";
let wired = false;

const area = () => document.getElementById("scriptsArea");

const escapeHTML = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pct = (s) => Math.round((100 * s.marks) / s.max_marks);
const tone = (g) => (g === "A*" || g === "A" ? "top" : g === "B" || g === "C" ? "mid" : "low");

function visibleScripts() {
  const list = courseFilter === "all" ? scripts : scripts.filter((s) => coursesForItem(s.subjects).includes(courseFilter));
  return [...list].sort((a, b) => pct(b) - pct(a) || new Date(b.created_at) - new Date(a.created_at));
}

function cardHTML(s) {
  const t = tone(s.grade);
  return `
  <button type="button" class="xs-card" data-xs-open="${s.id}"
    aria-label="${escapeHTML(s.title)}, ${escapeHTML(courseLabel(s.subjects))}, ${s.marks} out of ${s.max_marks}, grade ${escapeHTML(s.grade)}. Open script">
    <span class="xs-grade ${t === "mid" ? "" : t}" aria-hidden="true">${escapeHTML(s.grade)}</span>
    <span class="xs-body">
      <span class="xs-title">${escapeHTML(s.title)}</span>
      <span class="xs-meta">${escapeHTML(courseLabel(s.subjects))}${s.session ? ` · ${escapeHTML(s.session)}` : ""}</span>
      <span class="xs-marks"><span>Marks</span><b>${s.marks} / ${s.max_marks}</b></span>
      <span class="xs-track"><span class="xs-fill ${t === "top" ? "top" : ""}" style="width:${pct(s)}%"></span></span>
    </span>
    <span class="xs-go">Read →</span>
  </button>`;
}

function render() {
  const el = area();
  if (!el) return;
  if (loadError) {
    el.innerHTML = `<p class="empty-note">Couldn't load examiner scripts: ${escapeHTML(loadError)}</p>`;
    return;
  }
  if (!scripts.length) {
    el.innerHTML = '<p class="empty-note">No examiner scripts yet. Miss Rameen will add them here.</p>';
    return;
  }
  const courses = COURSES.filter((c) => scripts.some((s) => coursesForItem(s.subjects).includes(c.id)));
  if (courseFilter !== "all" && !courses.some((c) => c.id === courseFilter)) courseFilter = "all";
  const tabs = courses.length > 1
    ? `<div class="course-tabs" role="tablist" aria-label="Course">
        ${[{ id: "all", name: "All" }, ...courses].map((c) => `
        <button type="button" class="course-tab${c.id === courseFilter ? " active" : ""}" role="tab" aria-selected="${c.id === courseFilter}" data-xs-course="${c.id}">${escapeHTML(c.name)}</button>`).join("")}
      </div>`
    : "";
  el.innerHTML = `${tabs}<div class="xs-grid">${visibleScripts().map(cardHTML).join("")}</div>`;
}

async function fetchScripts() {
  const subjects = (STUDENT.subjects && STUDENT.subjects.length) ? STUDENT.subjects : ["none"];
  const { data, error } = await supabase
    .from("examiner_scripts")
    .select(COLS)
    .eq("cohort_id", STUDENT.cohortId)
    .overlaps("subjects", subjects);
  if (error) {
    loadError = error.message;
    return;
  }
  loadError = "";
  scripts = data || [];
}

export async function initExaminerScripts() {
  await fetchScripts();
  render();
  if (wired) return;
  wired = true;

  area().addEventListener("click", (e) => {
    const tab = e.target.closest("[data-xs-course]");
    if (tab) {
      courseFilter = tab.dataset.xsCourse;
      render();
      const again = area().querySelector(`[data-xs-course="${courseFilter}"]`);
      if (again) again.focus();
      return;
    }
    const card = e.target.closest("[data-xs-open]");
    if (card) openReader(scripts.find((s) => s.id === card.dataset.xsOpen), card);
  });

  // New scripts appear without a page reload when she opens the page again.
  window.addEventListener("hashchange", async () => {
    if (location.hash === "#scripts") {
      await fetchScripts();
      render();
    }
  });
}

/* ------------------------------------------------------------------ reader */

let pdfjsPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("vendor/pdfjs/pdf.min.js", document.baseURI).href;
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.js", document.baseURI).href;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { pdfjsPromise = null; reject(new Error("The reader couldn't load.")); };
      document.head.appendChild(s);
    });
  }
  return pdfjsPromise;
}

const reader = { el: null, pdf: null, pages: [], observer: null, zoom: 1, seq: 0, opener: null, open: false, resizeTimer: 0 };

function buildReader() {
  const el = document.createElement("div");
  el.className = "xs-reader";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Examiner script");
  el.innerHTML = `
    <div class="xs-bar">
      <div class="xs-bar-title"><strong id="xsTitle"></strong><span id="xsSub"></span></div>
      <span class="xs-pageno" id="xsPageNo" aria-live="polite"></span>
      <button type="button" class="xs-ctl" id="xsZoomOut" aria-label="Zoom out">−</button>
      <button type="button" class="xs-ctl" id="xsZoomIn" aria-label="Zoom in">+</button>
      <button type="button" class="xs-ctl close" id="xsClose">Close</button>
    </div>
    <div class="xs-scroll" id="xsScroll"><div class="xs-pages" id="xsPages"></div></div>`;
  document.body.appendChild(el);
  reader.el = el;

  el.querySelector("#xsClose").addEventListener("click", requestClose);
  el.querySelector("#xsZoomIn").addEventListener("click", () => setZoom(1));
  el.querySelector("#xsZoomOut").addEventListener("click", () => setZoom(-1));
  el.querySelector("#xsScroll").addEventListener("scroll", () => {
    if (reader.rafPending) return;
    reader.rafPending = true;
    requestAnimationFrame(() => { reader.rafPending = false; updatePageNo(); });
  }, { passive: true });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); requestClose(); return; }
    if (e.key !== "Tab") return;
    const focusable = [...el.querySelectorAll("button:not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  window.addEventListener("resize", () => {
    if (!reader.open) return;
    clearTimeout(reader.resizeTimer);
    reader.resizeTimer = setTimeout(layout, 150);
  });
  window.addEventListener("popstate", () => { if (reader.open) closeReader(); });
}

function setStateMessage(html) {
  reader.el.querySelector("#xsPages").innerHTML = `<div class="xs-state">${html}</div>`;
}

function requestClose() {
  if (history.state && history.state.xsReader) history.back();
  else closeReader();
}

function closeReader() {
  if (!reader.open) return;
  reader.open = false;
  reader.seq++;
  if (reader.observer) reader.observer.disconnect();
  reader.pages.forEach((p) => { if (p.task) p.task.cancel(); });
  reader.pages = [];
  if (reader.pdf) { reader.pdf.destroy(); reader.pdf = null; }
  reader.el.querySelector("#xsPages").innerHTML = "";
  reader.el.hidden = true;
  document.body.classList.remove("xs-reading");
  if (reader.opener && document.contains(reader.opener)) reader.opener.focus();
}

async function openReader(script, opener) {
  if (!script) return;
  if (!reader.el) buildReader();
  const mySeq = ++reader.seq;
  reader.opener = opener;
  reader.zoom = 1;
  reader.open = true;
  reader.el.hidden = false;
  document.body.classList.add("xs-reading");
  if (!(history.state && history.state.xsReader)) history.pushState({ xsReader: true }, "");

  reader.el.querySelector("#xsTitle").textContent = script.title;
  reader.el.querySelector("#xsSub").textContent = `${courseLabel(script.subjects)} · ${script.marks}/${script.max_marks} · Grade ${script.grade}`;
  reader.el.querySelector("#xsPageNo").textContent = "";
  reader.el.querySelector("#xsScroll").scrollTop = 0;
  setStateMessage('<div class="xs-spin" role="status" aria-label="Loading"></div>Opening the script…');
  reader.el.querySelector("#xsClose").focus();

  try {
    const pdfjs = await loadPdfJs();
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(script.pdf_path);
    if (error || !blob) throw new Error("download");
    const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
    if (mySeq !== reader.seq) { pdf.destroy(); return; }
    reader.pdf = pdf;

    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      if (mySeq !== reader.seq) return;
      const wrap = document.createElement("div");
      wrap.className = "xs-page";
      wrap.dataset.page = i;
      wrap.setAttribute("role", "img");
      wrap.setAttribute("aria-label", `Page ${i} of ${pdf.numPages}`);
      pages.push({ n: i, page, base: page.getViewport({ scale: 1 }), el: wrap, rendered: false, busy: false, task: null });
    }
    reader.pages = pages;
    const host = reader.el.querySelector("#xsPages");
    host.innerHTML = "";
    pages.forEach((p) => host.appendChild(p.el));

    reader.observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) renderPage(reader.pages[Number(en.target.dataset.page) - 1], mySeq);
      });
    }, { root: reader.el.querySelector("#xsScroll"), rootMargin: "700px 0px" });
    layout();
  } catch (err) {
    if (mySeq !== reader.seq) return;
    setStateMessage(`<p>Couldn't open this script. Check your connection and try again.</p>
      <button type="button" class="btn btn-primary" id="xsRetry">Try again</button>`);
    reader.el.querySelector("#xsRetry").addEventListener("click", () => { reader.open = true; openReader(script, opener); }, { once: true });
  }
}

function pageWidth() {
  const scroll = reader.el.querySelector("#xsScroll");
  const avail = scroll.clientWidth - (window.innerWidth <= 480 ? 12 : 24);
  return Math.max(200, Math.min(avail, 1000) * reader.zoom);
}

function layout() {
  if (!reader.pages.length) return;
  const scroll = reader.el.querySelector("#xsScroll");
  const ratio = scroll.scrollHeight ? scroll.scrollTop / scroll.scrollHeight : 0;
  const w = pageWidth();
  reader.observer.disconnect();
  reader.pages.forEach((p) => {
    if (p.task) { p.task.cancel(); p.task = null; }
    p.rendered = false;
    p.busy = false;
    p.el.replaceChildren();
    p.el.style.width = `${w}px`;
    p.el.style.height = `${(w * p.base.height) / p.base.width}px`;
    reader.observer.observe(p.el);
  });
  scroll.scrollTop = ratio * scroll.scrollHeight;
  updatePageNo();
  reader.el.querySelector("#xsZoomOut").disabled = reader.zoom <= ZOOMS[0];
  reader.el.querySelector("#xsZoomIn").disabled = reader.zoom >= ZOOMS[ZOOMS.length - 1];
}

async function renderPage(p, seq) {
  if (!p || p.rendered || p.busy || seq !== reader.seq) return;
  p.busy = true;
  try {
    const cssW = parseFloat(p.el.style.width);
    let scale = (cssW / p.base.width) * Math.min(window.devicePixelRatio || 1, 2);
    const px = p.base.width * p.base.height * scale * scale;
    if (px > MAX_PAGE_PIXELS) scale *= Math.sqrt(MAX_PAGE_PIXELS / px);
    const viewport = p.page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    p.task = p.page.render({ canvasContext: canvas.getContext("2d"), viewport });
    await p.task.promise;
    if (seq !== reader.seq) return;
    p.el.replaceChildren(canvas);
    p.rendered = true;
  } catch (err) {
    // A cancelled render (zoomed or closed mid-draw) is expected, nothing to show.
  } finally {
    p.busy = false;
    p.task = null;
  }
}

function setZoom(dir) {
  const i = ZOOMS.indexOf(reader.zoom);
  const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
  if (next === reader.zoom) return;
  reader.zoom = next;
  layout();
}

function updatePageNo() {
  if (!reader.pages.length) return;
  const scroll = reader.el.querySelector("#xsScroll");
  const mid = scroll.scrollTop + scroll.clientHeight / 2;
  let current = 1;
  for (const p of reader.pages) {
    if (p.el.offsetTop - scroll.offsetTop <= mid) current = p.n;
    else break;
  }
  reader.el.querySelector("#xsPageNo").textContent = `Page ${current} of ${reader.pages.length}`;
}
