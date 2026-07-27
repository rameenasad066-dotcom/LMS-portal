/* Light / dark theme toggle, shared by every page. The saved choice is
   applied by a tiny inline <head> script on each page (before first paint,
   so there's no flash); this file only handles the toggle button clicks and
   keeps the choice in localStorage. Any element with [data-theme-toggle]
   flips the theme — the sun/moon icon swap is pure CSS (see style.css). */

(function () {
  var KEY = "swr_theme";

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
    if (!btn) return;
    var current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setTheme(current === "dark" ? "light" : "dark");
  });
})();
