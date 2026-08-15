/* Study With Rameen · Teacher Portal
   Single data store + view router: dashboard previews and full pages
   always render from the same arrays below. */

const COHORT_DATA = {
  on26: {
    name: "October/November 2026",
    meta: "",
  },
  mj27: {
    name: "May/June 2027",
    meta: "Classes begin <strong>10 Aug 2026</strong>",
  },
};

// Used by teacher-notes-upload.js and teacher-lectures-upload.js's history lists.
const ICONS = {
  pdf: '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  video: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const VIEW_TITLES = {
  dashboard: "Dashboard",
  uploads: "Upload Notes",
  content: "Manage Content",
  assignments: "Assignments",
  "weekly-test": "Weekly Test",
  students: "Students",
  "student-report": "Student Report",
  attendance: "Attendance",
  scoreboard: "Scoreboard",
  settings: "Settings",
};

let activeCohort = "on26";

const $ = (id) => document.getElementById(id);

// Used by teacher-notes-upload.js's upload-history list to label a note's subject.
function subjectName(id) {
  const s = SUBJECTS.find((x) => x.id === id);
  return s ? s.name : id;
}

function renderHeader() {
  const data = COHORT_DATA[activeCohort];

  document.querySelectorAll(".pill").forEach((p) =>
    p.classList.toggle("active", p.dataset.cohort === activeCohort)
  );

  $("cohortMeta").innerHTML = data.meta;
  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  $("todaySub").textContent = `${dateStr} · ${data.name} cohort`;
}

function renderAll() {
  renderHeader();
}

/* ---------- View router ---------- */

function showView() {
  let view = (location.hash || "#dashboard").slice(1);
  if (!VIEW_TITLES[view]) view = "dashboard";

  document.querySelectorAll(".view").forEach((s) => {
    s.hidden = s.dataset.view !== view;
  });
  document.querySelectorAll(".snav-item[data-view]").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === view);
  });
  $("viewTitle").textContent = VIEW_TITLES[view];

  // Real-data modules (dashboard, scoreboard, assignments, roster, attendance)
  // only refetch on cohort-pill click or first load otherwise — without this,
  // marking work in Assignments then navigating straight to Scoreboard via
  // the sidebar shows stale data from before the marks existed.
  document.dispatchEvent(new CustomEvent("swr-view", { detail: view }));
}

window.addEventListener("hashchange", showView);

/* ---------- Toast ---------- */

let toastTimer;
function showToast(title, msg) {
  $("toastTitle").textContent = title;
  $("toastMsg").textContent = msg;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 4200);
}

/* ---------- Events ---------- */

document.querySelectorAll(".pill").forEach((pill) =>
  pill.addEventListener("click", () => {
    activeCohort = pill.dataset.cohort;
    renderAll();
  })
);

$("quickUploadBtn").addEventListener("click", () => {
  location.hash = "#uploads";
});

$("copyMeetingBtn").addEventListener("click", async () => {
  const link = "https://meet.google.com/swr-live-8pm";
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    /* clipboard unavailable (e.g. insecure context) — link still shown in the toast */
  }
  showToast("Meeting link copied", link);
});

/* ---------- Init ---------- */

showView();
// Exposed so other modules (teacher-notes-upload.js, teacher-dashboard.js,
// etc.) can await SUBJECTS + activeCohort being ready before rendering —
// module scripts run before this async fetch necessarily resolves.
window.dataReadyPromise = loadData();
window.dataReadyPromise
  .then(() => {
    renderAll();
  })
  .catch(() => showToast("Content failed to load", "Check that the files in data/ are valid JSON."));
