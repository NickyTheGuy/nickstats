(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const tabs = new Map(), profiles = new Map();
  const comparison = window.NickStatsSessionUI.create({ onRetry: () => {
    const entry = tabs.get(active); if (entry) { profiles.delete(entry.playerID); load(entry); }
  } });
  let active = null, pending = null;
  const route = () => {
    const match = location.hash.match(/^#session\/(\d+)\/(\d+)$/);
    return match ? { playerID: match[1], anchorID: match[2], key: `${match[1]}/${match[2]}` } : null;
  };
  const sameRoute = key => route()?.key === key;

  async function json(url, signal) {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }

  function renderTabs() {
    document.querySelectorAll("[data-session-tab]").forEach(node => node.remove());
    tabs.forEach((entry, key) => {
      const item = document.createElement("div"); item.dataset.sessionTab = key;
      item.className = `player-open-tab${active === key ? " active" : ""}`;
      const button = document.createElement("button"); button.type = "button";
      button.className = "player-open-tab-label"; button.textContent = "Session";
      button.dataset.matchBrowserView = "session"; button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", "sessionView"); button.setAttribute("aria-selected", String(active === key));
      button.tabIndex = active === key ? 0 : -1;
      button.title = entry.label || `Session for player #${entry.playerID}, match #${entry.anchorID}`;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => { location.hash = `#session/${key}`; });
      const close = document.createElement("button"); close.type = "button";
      close.className = "player-open-tab-close"; close.textContent = "×";
      close.setAttribute("aria-label", `Close ${button.title}`);
      close.addEventListener("click", () => {
        tabs.delete(key);
        if (active === key) location.hash = tabs.size ? `#session/${[...tabs.keys()].at(-1)}` : "#match";
        renderTabs();
      });
      item.append(button, close); $("matchBrowserTabs").appendChild(item);
    });
  }

  function display(entry) {
    if (!sameRoute(entry.key)) return;
    comparison.render({ players: entry.players, summarize: window.NickStatsPlayerStats.sessionSummary, metaSuffix: entry.label });
  }

  async function load(entry) {
    pending?.controller.abort();
    const controller = new AbortController(); pending = { key: entry.key, controller };
    comparison.loading();
    try {
      const profile = profiles.get(entry.playerID) || window.NickStatsPlayerStats.expandDenseProfile(
        await json(`/nickstats/api/players/${entry.playerID}?compact=true&wire=2`, controller.signal));
      profiles.set(entry.playerID, profile);
      const session = window.NickStatsMatchSessions.group(profile.matches || [])
        .find(session => session.matches.some(match => String(match.id) === entry.anchorID));
      if (!session) throw new Error("This session's match is no longer in the player's history.");
      const matchIDs = new Set(session.matches.map(match => String(match.id)));
      const teammateIDs = [...new Set(session.matches.flatMap(match => match.teammate_ids || []).map(String))]
        .filter(id => id !== entry.playerID && /^[1-9]\d*$/.test(id));
      const players = [{ id: entry.playerID, label: profile.player?.name || "Player", rows: session.matches }];
      // Scope the database queries before building stats, rather than downloading
      // every teammate's entire history. Keep requests bounded for long sessions.
      const sessionIDs = [...matchIDs];
      const participants = new Map();
      for (let offset = 0; offset < teammateIDs.length; offset += 20) {
        const ids = teammateIDs.slice(offset, offset + 20);
        // The comparison API requires at least two players. Including the anchor
        // also keeps a single-teammate request compatible with older backends.
        const requestedIDs = ids.length === 1 ? [...ids, entry.playerID] : ids;
        for (let matchOffset = 0; matchOffset < sessionIDs.length; matchOffset += 100) {
          const payload = await json(`/nickstats/api/groups?${new URLSearchParams({
            players: requestedIDs.join(","), matches: sessionIDs.slice(matchOffset, matchOffset + 100).join(",")
          })}`, controller.signal);
          for (const player of payload.players || []) {
            const id = String(player.id);
            if (!ids.includes(id)) continue;
            const participant = participants.get(id) || { id, label: player.name || "Player", rows: [] };
            const seen = new Set(participant.rows.map(match => String(match.id)));
            participant.rows.push(...(player.matches || []).filter(match => matchIDs.has(String(match.id)) && !seen.has(String(match.id))));
            participants.set(id, participant);
          }
        }
      }
      players.push(...[...participants.values()].filter(player => player.rows.length));
      if (controller.signal.aborted) return;
      const date = session.start == null ? "Date unknown" : new Date(session.start * 1000).toLocaleString();
      entry.label = `Session · ${profile.player?.name || "Player"} · ${date}`;
      entry.players = players;
      if (sameRoute(entry.key)) { renderTabs(); display(entry); }
    } catch (error) {
      if (error.name !== "AbortError" && sameRoute(entry.key)) {
        comparison.error(`Could not load session: ${error.message}`);
      }
    } finally {
      if (pending?.controller === controller) pending = null;
    }
  }

  function sync() {
    const current = route();
    if (!current) { active = null; pending?.controller.abort(); pending = null; renderTabs(); return; }
    active = current.key;
    if (!tabs.has(current.key)) tabs.set(current.key, current);
    window.NickStatsMatchBrowser.showView("session"); renderTabs();
    const entry = tabs.get(current.key);
    if (entry.players) { pending?.controller.abort(); pending = null; display(entry); }
    else if (pending?.key !== current.key) load(entry);
  }

  window.addEventListener("hashchange", sync);
  window.addEventListener("nickstats:page", event => { if (event.detail?.page === "match") sync(); });
  window.addEventListener("nickstats:match-browser-view", event => {
    if (event.detail?.view !== "session") { active = null; pending?.controller.abort(); pending = null; renderTabs(); }
  });
  window.addEventListener("nickstats:matches-changed", () => {
    profiles.clear(); tabs.forEach(entry => { delete entry.players; });
    pending?.controller.abort(); pending = null; sync();
  });
  window.NickStatsSessions = Object.freeze({ open(playerID, anchorID, profile) {
    if (!/^[1-9]\d*$/.test(String(playerID)) || !/^[1-9]\d*$/.test(String(anchorID))) return;
    if (profile) profiles.set(String(playerID), profile);
    location.hash = `#session/${playerID}/${anchorID}`;
  } });
  sync();
})();
