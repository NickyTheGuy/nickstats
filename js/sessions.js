(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const tabs = new Map(), profiles = new Map();
  const comparison = window.NickStatsQuickComparison.create({ prefix: "session" });
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
    $("sessionStatus").textContent = ""; $("sessionRetry").hidden = true; $("sessionContent").hidden = false;
    comparison.render({ players: entry.players, summarize: window.NickStatsPlayerStats.sessionSummary, metaSuffix: entry.label });
  }

  async function load(entry) {
    pending?.controller.abort();
    const controller = new AbortController(); pending = { key: entry.key, controller };
    $("sessionContent").hidden = true; $("sessionRetry").hidden = true;
    $("sessionStatus").textContent = "Loading session…"; $("sessionStatus").classList.remove("error");
    $("sessionQuickMeta").textContent = "";
    try {
      const profile = profiles.get(entry.playerID) || window.NickStatsPlayerStats.expandDenseProfile(
        await json(`/nickstats/api/players/${entry.playerID}?compact=true&wire=2`, controller.signal));
      const session = window.NickStatsMatchSessions.group(profile.matches || [])
        .find(session => session.matches.some(match => String(match.id) === entry.anchorID));
      if (!session) throw new Error("This session's match is no longer in the player's history.");
      const matchIDs = new Set(session.matches.map(match => String(match.id)));
      const teammateIDs = [...new Set(session.matches.flatMap(match => match.teammate_ids || []).map(String))]
        .filter(id => id !== entry.playerID && /^[1-9]\d*$/.test(id));
      const players = [{ id: entry.playerID, label: profile.player?.name || "Player", rows: session.matches }];
      // Reuse the existing comparison API. Restrict every player's rows to this
      // session's exact match IDs; simultaneous games and other sessions cannot leak in.
      for (let offset = 0; offset < teammateIDs.length; offset += 20) {
        const ids = teammateIDs.slice(offset, offset + 20);
        let teammates;
        if (ids.length === 1) {
          const payload = window.NickStatsPlayerStats.expandDenseProfile(
            await json(`/nickstats/api/players/${ids[0]}?compact=true&wire=2`, controller.signal));
          teammates = [{ ...payload.player, matches: payload.matches }];
        } else {
          const payload = await json(`/nickstats/api/groups?${new URLSearchParams({ players: ids.join(",") })}`, controller.signal);
          teammates = payload.players || [];
        }
        teammates.forEach(player => {
          const rows = (player.matches || []).filter(match => matchIDs.has(String(match.id)));
          if (rows.length) players.push({ id: String(player.id), label: player.name || "Player", rows });
        });
      }
      if (controller.signal.aborted) return;
      const date = session.start == null ? "Date unknown" : new Date(session.start * 1000).toLocaleString();
      entry.label = `Session · ${profile.player?.name || "Player"} · ${date}`;
      entry.players = players;
      if (sameRoute(entry.key)) { renderTabs(); display(entry); }
    } catch (error) {
      if (error.name !== "AbortError" && sameRoute(entry.key)) {
        $("sessionStatus").textContent = `Could not load session: ${error.message}`;
        $("sessionStatus").classList.add("error"); $("sessionRetry").hidden = false;
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

  $("sessionRetry").addEventListener("click", () => {
    const entry = tabs.get(active); if (entry) { profiles.delete(entry.playerID); load(entry); }
  });
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
