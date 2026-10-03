/* Notification bell (student.html topnav) — unread announcements.
   Replaces a demo button with a hardcoded "2 unread" badge that had no
   listener or data behind it. Unread = announcements for this student's
   cohort posted after their `announcement_reads.last_seen_at` (one row per
   student, supabase/migrations/announcement-reads.sql). Opening the panel
   marks everything shown as seen.

   last_seen_at is set to the newest announcement's own created_at, never
   the device's clock — a phone with a wrong clock (see the Weekly Test fix)
   would otherwise hide or resurrect notifications. Exported rather than
   self-running because it needs STUDENT.id/cohortId — auth-guard.js calls
   initNotifications() once the profile has resolved. */

import { supabase } from "./supabase-config.js";

const $ = (id) => document.getElementById(id);
const TAG_LABEL = { pinned: "Pinned", action: "Action", info: "Update" };
const SHOWN = 10;

let items = [];
let lastSeen = null;
// false when announcement_reads can't be read (e.g. its SQL hasn't been run
// yet) — then the badge stays hidden rather than showing everything as
// unread forever with no way to clear it.
let tracking = false;

const ts = (iso) => new Date(iso).getTime();

function isUnread(a) {
  return tracking && (!lastSeen || ts(a.created_at) > ts(lastSeen));
}

function fmtDateShort(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function renderBadge() {
  const badge = $("notifBadge");
  const btn = $("notifBtn");
  const unread = items.filter(isUnread).length;
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? "9+" : String(unread);
  btn.setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications");
}

// `unreadIds` is a snapshot taken when the panel opens, so items stay
// highlighted while it's open even though they've just been marked seen.
function renderPanel(unreadIds) {
  $("notifList").innerHTML = items.length
    ? items.map((a) => {
      const tag = TAG_LABEL[a.tag] ? a.tag : "info";
      return `
      <li class="notif-item tag-${tag}${unreadIds.has(a.id) ? " unread" : ""}">
        <div class="notif-top">
          <span class="ann-tag">${TAG_LABEL[tag]}</span>
          <span class="notif-date">${fmtDateShort(a.created_at)}</span>
        </div>
        <strong>${esc(a.title)}</strong>
        <p>${esc(a.body)}</p>
      </li>`;
    }).join("")
    : '<li class="notif-empty">No announcements yet.</li>';
}

async function fetchState() {
  const [{ data: anns, error }, { data: read, error: readErr }] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, tag, title, body, created_at")
      .eq("cohort_id", STUDENT.cohortId)
      .order("created_at", { ascending: false })
      .limit(SHOWN),
    supabase.from("announcement_reads").select("last_seen_at").eq("student_id", STUDENT.id).maybeSingle(),
  ]);
  items = error ? [] : anns || [];
  tracking = !readErr;
  lastSeen = read ? read.last_seen_at : null;
  renderBadge();
}

async function markSeen() {
  if (!items.length || !tracking || STUDENT.isPreview) return;
  const newest = items[0].created_at;
  if (lastSeen && ts(newest) <= ts(lastSeen)) return;

  const previous = lastSeen;
  lastSeen = newest;
  renderBadge();
  const { error } = await supabase
    .from("announcement_reads")
    .upsert({ student_id: STUDENT.id, last_seen_at: newest }, { onConflict: "student_id" });
  if (error) {
    lastSeen = previous;
    renderBadge();
  }
}

function openPanel() {
  renderPanel(new Set(items.filter(isUnread).map((a) => a.id)));
  $("notifPanel").hidden = false;
  $("notifBtn").setAttribute("aria-expanded", "true");
  markSeen();
}

function closePanel() {
  $("notifPanel").hidden = true;
  $("notifBtn").setAttribute("aria-expanded", "false");
}

export async function initNotifications() {
  if (!$("notifBtn") || !STUDENT.id) return;
  await fetchState();
}

$("notifBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if ($("notifPanel").hidden) openPanel();
  else closePanel();
});

$("notifClose").addEventListener("click", closePanel);
$("notifSeeAll").addEventListener("click", closePanel);

document.addEventListener("click", (e) => {
  if ($("notifPanel").hidden) return;
  if (e.target.closest("#notifPanel") || e.target.closest("#notifBtn")) return;
  closePanel();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("notifPanel").hidden) {
    closePanel();
    $("notifBtn").focus();
  }
});

// Pick up announcements posted while the tab sat open.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && STUDENT.id && $("notifPanel").hidden) fetchState();
});
