(() => {
  "use strict";

  const pages = new Set(["match", "compare", "players"]);

  function showPage(page, updateHash = true) {
    const next = pages.has(page) ? page : "match";
    document.querySelectorAll("[data-app-page]").forEach(button => {
      const active = button.dataset.appPage === next;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-app-view]").forEach(view => {
      view.hidden = view.dataset.appView !== next;
    });
    if (updateHash && location.hash !== `#${next}`) history.replaceState(null, "", `#${next}`);
  }

  document.querySelectorAll("[data-app-page]").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.appPage));
  });
  window.addEventListener("hashchange", () => showPage(location.hash.slice(1), false));
  showPage(location.hash.slice(1), true);
})();
