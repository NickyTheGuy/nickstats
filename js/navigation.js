(() => {
  "use strict";

  const pages = new Set(["match", "players", "groups", "analyzer"]);
  const routePage = route => String(route || "").split("/")[0];

  function showPage(page, updateHash = true) {
    const requestedPage = routePage(page) === "session" ? "players" : routePage(page);
    const next = pages.has(requestedPage) ? requestedPage : "match";
    tabs.update({ value: next });
    document.querySelectorAll("[data-app-view]").forEach(view => {
      view.hidden = view.dataset.appView !== next;
    });
    const currentRoute = location.hash.slice(1);
    const validMatchDetail = next === "match" && /^match\/\d+$/.test(currentRoute);
    const validSessionDetail = next === "players" && /^session\/(?:\d+\/\d+|selection\/[a-f0-9-]{36})$/.test(currentRoute);
    const validAnalyzerDetail = next === "analyzer" && currentRoute.startsWith("analyzer/");
    if (updateHash && location.hash !== `#${next}` && !validMatchDetail && !validSessionDetail && !validAnalyzerDetail) history.replaceState(null, "", `#${next}`);
    window.dispatchEvent(new CustomEvent("nickstats:page", { detail: { page: next } }));
  }

  const tabs = window.NickStatsShellUI.tabs("appNavigation", {
    label: "NickStats sections", className: "data-tabs app-tabs", tabClassName: "data-tab", value: "match",
    options: [["match", "Match", { tabProps: { id: "matchPageTab", "aria-controls": "matchPage", "data-app-page": "match" } }],
      ["players", "Player", { tabProps: { id: "playersPageTab", "aria-controls": "playersPage", "data-app-page": "players" } }],
      ["groups", "Groups", { tabProps: { id: "groupsPageTab", "aria-controls": "groupsPage", "data-app-page": "groups" } }],
      ["analyzer", "Analyzer", { tabProps: { id: "analyzerPageTab", "aria-controls": "analyzerPage", "data-app-page": "analyzer" } }]],
    onChange: page => showPage(page)
  });
  window.addEventListener("hashchange", () => showPage(location.hash.slice(1), false));
  showPage(location.hash.slice(1), true);
})();
