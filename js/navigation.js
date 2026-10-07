(() => {
  "use strict";

  const pages = new Set(["match", "players", "groups"]);
  const routePage = route => String(route || "").split("/")[0];

  function showPage(page, updateHash = true) {
    const requestedPage = routePage(page) === "session" ? "match" : routePage(page);
    const next = pages.has(requestedPage) ? requestedPage : "match";
    document.querySelectorAll("[data-app-page]").forEach(button => {
      const active = button.dataset.appPage === next;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-app-view]").forEach(view => {
      view.hidden = view.dataset.appView !== next;
    });
    const currentRoute = location.hash.slice(1);
    const validMatchDetail = next === "match" && /^match\/\d+$/.test(currentRoute);
    const validSessionDetail = next === "match" && /^session\/\d+\/\d+$/.test(currentRoute);
    if (updateHash && location.hash !== `#${next}` && !validMatchDetail && !validSessionDetail) history.replaceState(null, "", `#${next}`);
    window.dispatchEvent(new CustomEvent("nickstats:page", { detail: { page: next } }));
  }

  document.querySelectorAll("[data-app-page]").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.appPage));
  });
  window.addEventListener("hashchange", () => showPage(location.hash.slice(1), false));
  showPage(location.hash.slice(1), true);
})();
