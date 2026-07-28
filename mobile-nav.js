/* Mobile nav drawer, shared by both portals. On phone/tablet widths the
   sidebar is an off-canvas drawer (see the ≤900 rules in style.css); the
   hamburger ([data-nav-toggle]) slides it in, and it closes on backdrop tap,
   Escape, or picking a nav item. A no-op on desktop, where the sidebar is
   always visible and the toggle is hidden. */

(function () {
  function backdrop() {
    let bd = document.querySelector(".nav-backdrop");
    if (!bd) {
      bd = document.createElement("div");
      bd.className = "nav-backdrop";
      document.body.appendChild(bd);
    }
    return bd;
  }

  function setOpen(open) {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    backdrop().classList.toggle("show", open);
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-nav-toggle]")) {
      const sidebar = document.querySelector(".sidebar");
      setOpen(!(sidebar && sidebar.classList.contains("open")));
      return;
    }
    if (e.target.closest(".nav-backdrop")) { setOpen(false); return; }
    if (e.target.closest(".snav-item")) { setOpen(false); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });
})();
