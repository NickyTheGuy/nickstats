(() => {
  "use strict";

  function resetProfileFilters({ state, mapFilter, dateFilter, tagFilter, toggles, onReset = () => {} }) {
    Object.assign(state, { side: "ALL", buy: "ALL", heroOnly: false, opponentBuy: "ALL", roundResult: "ALL", roundPhase: "ALL", result: "ALL", maps: [] });
    if (Object.hasOwn(state, "comboCondition")) state.comboCondition = "without";
    for (const toggle of toggles) toggle.set("ALL", { notify: false });
    mapFilter.reset(); dateFilter.reset(); dateFilter.closeMenus(); tagFilter.reset();
    onReset();
  }

  function matchResultMatches(result, filter) {
    return filter === "ALL" || result === filter;
  }

  function resultFilterLabel(filter) {
    return filter === "w" ? "Wins only" : filter === "l" ? "Losses only" : "All results";
  }

  function scoreBreakdown(rows, {
    resultFor = row => row.result,
    scoreFor = row => row.score_for,
    scoreAgainst = row => row.score_against
  } = {}) {
    const buckets = { wins: { count: 0, for: 0, against: 0 }, losses: { count: 0, for: 0, against: 0 } };
    for (const row of rows || []) {
      const bucket = resultFor(row) === "w" ? buckets.wins : resultFor(row) === "l" ? buckets.losses : null;
      const ownRaw = scoreFor(row), opponentRaw = scoreAgainst(row);
      const own = Number(ownRaw), opponent = Number(opponentRaw);
      if (!bucket || ownRaw == null || ownRaw === "" || opponentRaw == null || opponentRaw === "" ||
          !Number.isFinite(own) || !Number.isFinite(opponent)) continue;
      bucket.count += 1; bucket.for += own; bucket.against += opponent;
    }
    for (const bucket of Object.values(buckets)) {
      if (bucket.count) {
        bucket.for /= bucket.count; bucket.against /= bucket.count;
      }
      bucket.margin = bucket.for - bucket.against;
    }
    return buckets;
  }

  window.NickStatsFilters = Object.freeze({
    resetProfileFilters,
    matchResultMatches,
    resultFilterLabel,
    scoreBreakdown
  });
})();
