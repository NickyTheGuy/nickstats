(() => {
  "use strict";

  const endpoint = "/nickstats/api/matches/revision";
  const storageKey = "nickstats.matchesChanged.v1";
  let revision = null;
  let generation = 0;
  let pending = null;

  function announce(local = false) {
    window.dispatchEvent(new CustomEvent("nickstats:matches-changed", { detail: { local } }));
  }

  function changed({ broadcast = true } = {}) {
    generation += 1;
    revision = null;
    pending = null;
    announce(broadcast);
    if (broadcast) {
      try { localStorage.setItem(storageKey, `${Date.now()}:${Math.random()}`); } catch (_) {}
    }
  }

  function check() {
    if (pending) return pending;
    const started = generation;
    const request = (async () => {
      try {
        const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (started !== generation || typeof payload.revision !== "string") return;
        const previous = revision;
        revision = payload.revision;
        if (previous !== null && previous !== revision) announce();
      } catch (_) {
        // Keep the last known revision. The next page visit will try again.
      }
    })();
    const wrapped = request.finally(() => { if (pending === wrapped) pending = null; });
    pending = wrapped;
    return wrapped;
  }

  window.addEventListener("nickstats:page", check);
  window.addEventListener("storage", event => { if (event.key === storageKey) changed({ broadcast: false }); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.NickStatsDataFreshness = Object.freeze({ check, changed });
  check();
})();
