/* Winner celebration (student.html) — a full-screen "you won" screen shown once
   to a student who has an unseen row in `winners` (supabase/migrations/
   winners.sql). Who gets it is decided entirely by those rows; there is no
   name check here. Pressing Continue (or Escape) stamps seen_at so it never
   shows again on any device. "View as a student" shows it too, so the teacher
   can preview it, but never stamps anything.
   Exported rather than self-running because it needs STUDENT.id/name —
   auth-guard.js calls initWinner() once the profile has resolved. */

import { supabase } from "./supabase-config.js";

const STAR = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z"/></svg>';
const TROPHY = `
  <svg class="win-trophy" viewBox="0 0 200 220" aria-hidden="true">
    <defs>
      <linearGradient id="winGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFEBB0"/><stop offset=".45" stop-color="#F6C453"/><stop offset="1" stop-color="#C98A12"/></linearGradient>
      <linearGradient id="winShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="winClip"><path d="M50 18h100v52c0 34-22 60-50 60s-50-26-50-60z"/><rect x="90" y="128" width="20" height="40"/><path d="M58 168h84l8 28H50z"/></clipPath>
    </defs>
    <path d="M50 34H24c0 30 15 48 38 53" fill="none" stroke="url(#winGold)" stroke-width="11" stroke-linecap="round"/>
    <path d="M150 34h26c0 30-15 48-38 53" fill="none" stroke="url(#winGold)" stroke-width="11" stroke-linecap="round"/>
    <path d="M50 18h100v52c0 34-22 60-50 60s-50-26-50-60z" fill="url(#winGold)"/>
    <rect x="90" y="128" width="20" height="40" fill="url(#winGold)"/>
    <path d="M58 168h84l8 28H50z" fill="url(#winGold)"/>
    <rect x="44" y="196" width="112" height="16" rx="5" fill="#B7770C"/>
    <polygon points="100,38 107,58 128,58 111,70 118,90 100,78 82,90 89,70 72,58 93,58" fill="#FFF7DA" opacity=".95"/>
    <g clip-path="url(#winClip)"><rect class="win-sweep" x="-30" y="0" width="46" height="230" fill="url(#winShine)" transform="skewX(-18)"/></g>
  </svg>`;
const SPARKS = [["left:-14px;top:18px", .2], ["right:-10px;top:4px", .9], ["right:-22px;top:92px", 1.4], ["left:-26px;top:100px", .6]]
  .map(([pos, delay]) => `<span class="win-spark" style="${pos};animation-delay:${delay}s">${STAR}</span>`).join("");

const COLORS = ["#FFFFFF", "#F6C453", "#FFD98A", "#3C9A44", "#7FD28A", "#FF6B76"];
const fmt = (n) => Math.round(n).toLocaleString("en-US");

export async function initWinner() {
  if (!STUDENT.id) return;
  const { data, error } = await supabase
    .from("winners")
    .select("id, month_label, prize_amount")
    .eq("student_id", STUDENT.id)
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return;
  show(data[0]);
}

function firstName() {
  const word = String(STUDENT.name || "").trim().split(/\s+/)[0] || "Champion";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function show(win) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const opener = document.activeElement;
  const el = document.createElement("div");
  el.className = "win-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "winTitle");
  el.innerHTML = `
    <div class="win-rays" aria-hidden="true"></div>
    <canvas class="win-fx" aria-hidden="true"></canvas>
    <section class="win-card">
      <div class="win-trophy-wrap" aria-hidden="true">${TROPHY}${SPARKS}</div>
      <div class="win-eyebrow"></div>
      <h1 class="win-title" id="winTitle">Congratulations,<span class="win-name"></span></h1>
      <p class="win-sub"></p>
      <div class="win-prize" role="group" aria-label="Your prize">
        <small>You have won a cash prize of</small>
        <b>Rs <span class="win-amt"></span></b>
      </div>
      <p class="win-note"><strong>Miss Rameen will reach out to you soon.</strong><br>Keep up the amazing work!</p>
      <div class="win-actions">
        <button type="button" class="win-btn main" data-win-go>Continue to my portal</button>
        <button type="button" class="win-btn ghost" data-win-again>Celebrate again</button>
      </div>
    </section>`;

  el.querySelector(".win-eyebrow").textContent = `${win.month_label} winner`;
  el.querySelector(".win-name").textContent = `${firstName()}!`;
  const sub = el.querySelector(".win-sub");
  sub.append("You are the winner for the month of ");
  const strong = document.createElement("strong");
  strong.textContent = win.month_label;
  sub.append(strong, ".");
  const amt = el.querySelector(".win-amt");
  amt.textContent = fmt(win.prize_amount);

  document.body.appendChild(el);
  document.body.classList.add("win-open");
  const goBtn = el.querySelector("[data-win-go]");
  goBtn.focus({ preventScroll: true });

  /* confetti */
  const cv = el.querySelector(".win-fx"), ctx = cv.getContext("2d");
  let W = 0, H = 0, parts = [], running = false, drizzleUntil = 0, closed = false;
  const timers = [];
  const size = () => { const dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size();
  const unit = () => Math.min(W, H) / 700 + .45;

  function burst(x, y, angle, spread, count, speed) {
    count = Math.round(count * Math.min(1, (W * H) / 500000 + .5));
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - .5) * spread, v = speed * unit() * (.45 + Math.random() * .75);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 7, h: 3 + Math.random() * 5,
        rot: Math.random() * 6.28, vr: (Math.random() - .5) * .35, flip: Math.random() * 6.28, vf: .12 + Math.random() * .2,
        c: COLORS[(Math.random() * COLORS.length) | 0], life: 0, max: 170 + Math.random() * 130, round: Math.random() < .22 });
    }
    start();
  }
  function frame(t) {
    if (!running || closed) return;
    ctx.clearRect(0, 0, W, H);
    if (t < drizzleUntil && Math.random() < .55) burst(Math.random() * W, -10, Math.PI / 2, 1.2, 2, 2.2);
    parts = parts.filter((p) => p.life < p.max && p.y < H + 40);
    for (const p of parts) {
      p.vx *= .985; p.vy = p.vy * .985 + .24; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.flip += p.vf; p.life++;
      ctx.globalAlpha = p.life > p.max - 40 ? Math.max(0, (p.max - p.life) / 40) : 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.flip)); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, 6.28); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (parts.length || t < drizzleUntil) requestAnimationFrame(frame); else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  function start() { if (!running && !closed) { running = true; requestAnimationFrame(frame); } }

  function countUp() {
    const t0 = performance.now() + 1100, dur = 1900;
    amt.textContent = "0";
    (function tick(now) {
      if (closed) return;
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      amt.textContent = fmt(win.prize_amount * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }
  function celebrate() {
    if (reduce) return;
    timers.forEach(clearTimeout); timers.length = 0;
    const cannon = () => { burst(0, H * .92, -Math.PI / 3, .6, 70, 19); burst(W, H * .92, -2 * Math.PI / 3, .6, 70, 19); };
    timers.push(setTimeout(cannon, 450), setTimeout(cannon, 1500));
    timers.push(setTimeout(() => { burst(W / 2, H * .35, -Math.PI / 2, 6.28, 90, 12); drizzleUntil = performance.now() + 5500; start(); }, 2500));
    countUp();
  }

  const onResize = () => size();
  addEventListener("resize", onResize);
  celebrate();

  el.addEventListener("pointerdown", (e) => { if (!reduce && !e.target.closest("button")) burst(e.clientX, e.clientY, -Math.PI / 2, 5, 40, 10); });
  el.querySelector("[data-win-again]").addEventListener("click", () => {
    el.querySelectorAll(".win-trophy-wrap,.win-eyebrow,.win-title,.win-sub,.win-prize,.win-note,.win-actions").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
    celebrate();
  });

  async function dismiss() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey, true);
    el.classList.add("out");
    setTimeout(() => {
      el.remove();
      document.body.classList.remove("win-open");
      if (opener && document.contains(opener) && opener.focus) opener.focus({ preventScroll: true });
    }, reduce ? 0 : 340);
    if (STUDENT.isPreview) return;
    const { error } = await supabase.from("winners").update({ seen_at: new Date().toISOString() }).eq("id", win.id);
    if (error) console.warn("[winner] couldn't mark the notice as seen", error.message);
  }
  goBtn.addEventListener("click", dismiss);

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); dismiss(); return; }
    if (e.key !== "Tab") return;
    const items = [...el.querySelectorAll("button")];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener("keydown", onKey, true);
}
