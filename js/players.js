(() => {
  "use strict";

  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const $ = id => document.getElementById(id);
  let searchController = null;
  let profileController = null;
  let searchTimer = null;

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const integer = value => Math.round(number(value)).toLocaleString();
  const decimal = (value, places = 1) => number(value).toFixed(places);
  const percent = value => `${decimal(value, 1)}%`;
  const ratio = (numerator, denominator) => denominator > 0 ? number(numerator) / number(denominator) : number(numerator);

  function titleCase(value) {
    return String(value || "Unknown")
      .replace(/^weapon_/, "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  async function apiJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }

  function setSearchStatus(message, error = false) {
    $("playerSearchStatus").textContent = message;
    $("playerSearchStatus").classList.toggle("error", error);
  }

  function statCard(label, value, note = "", className = "") {
    const card = document.createElement("div");
    card.className = `player-stat-card ${className}`.trim();
    const name = document.createElement("span");
    name.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(name, strong);
    if (note) {
      const detail = document.createElement("small");
      detail.textContent = note;
      card.appendChild(detail);
    }
    return card;
  }

  function fillCards(target, cards) {
    const element = $(target);
    element.replaceChildren(...cards.map(card => statCard(...card)));
  }

  function setPlayerView(view) {
    document.querySelectorAll("[data-player-view]").forEach(button => {
      const active = button.dataset.playerView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-player-profile-view]").forEach(panel => {
      panel.hidden = panel.dataset.playerProfileView !== view;
    });
  }

  function renderSearchResults(players) {
    const results = $("playerSearchResults");
    results.replaceChildren();
    for (const player of players) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "player-search-result";
      const identity = document.createElement("span");
      identity.className = "player-result-identity";
      const name = document.createElement("strong");
      name.textContent = player.name || "Unknown player";
      const steam = document.createElement("span");
      steam.textContent = player.steam_id || "No Steam ID";
      identity.append(name, steam);
      const count = document.createElement("span");
      count.className = "player-result-count";
      count.textContent = `${integer(player.match_count)} match${number(player.match_count) === 1 ? "" : "es"}`;
      const open = document.createElement("span");
      open.className = "player-result-open";
      open.textContent = "Open profile →";
      button.append(identity, count, open);
      button.addEventListener("click", () => loadProfile(player.id));
      results.appendChild(button);
    }
  }

  async function searchPlayers() {
    const query = $("playerSearchInput").value.trim();
    searchController?.abort();
    searchController = new AbortController();
    setSearchStatus("Searching players…");
    try {
      const parameters = new URLSearchParams({ q: query, limit: "25", offset: "0" });
      const payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}?${parameters}`, {
        headers: { "Accept": "application/json" },
        signal: searchController.signal
      }));
      const players = Array.isArray(payload.players) ? payload.players : [];
      renderSearchResults(players);
      setSearchStatus(players.length
        ? `${players.length} player${players.length === 1 ? "" : "s"} found.`
        : "No players matched that search.");
    } catch (error) {
      if (error.name === "AbortError") return;
      $("playerSearchResults").replaceChildren();
      setSearchStatus(`Could not search players: ${error.message}`, true);
    }
  }

  function renderTable(table, headers, rows) {
    table.replaceChildren();
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of headers) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headerRow.appendChild(cell);
    }
    head.appendChild(headerRow);
    const body = document.createElement("tbody");
    for (const values of rows) {
      const row = document.createElement("tr");
      values.forEach((value, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    }
    table.append(head, body);
  }

  function renderProfile(payload) {
    const player = payload.player || {};
    const headline = payload.headline || {};
    const totals = payload.totals || {};
    const utility = payload.utility || {};
    const trades = payload.trades || {};
    const openings = payload.openings || {};
    const weapons = Array.isArray(payload.weapons) ? payload.weapons : [];
    const maps = Array.isArray(payload.maps) ? payload.maps : [];
    const matches = number(totals.matches);

    $("playerProfileName").textContent = player.name || "Unknown player";
    $("playerProfileMeta").textContent = `Steam ${player.steam_id || "unknown"} · ${integer(matches)} match${matches === 1 ? "" : "es"}`;
    $("playerProfileRecord").textContent = `${integer(totals.wins)}–${integer(totals.losses)}${number(totals.draws) ? `–${integer(totals.draws)}` : ""}`;

    const ratingClass = number(headline.rating) >= 1.10
      ? "rating-good"
      : number(headline.rating) <= 0.90 ? "rating-bad" : "rating-average";
    fillCards("playerHeadlineStats", [
      ["Average rating", decimal(headline.rating, 2), "Round-weighted", ratingClass],
      ["Average K/D", decimal(headline.kd, 2), `${integer(totals.kills)} K · ${integer(totals.deaths)} D`],
      ["Average ADR", decimal(headline.adr, 1), `${integer(totals.damage)} total damage`],
      ["Average KAST", percent(headline.kast), `${integer(totals.kast_rounds)} KAST rounds`],
      ["Win rate", percent(headline.win_rate), `${integer(totals.wins)} wins in ${integer(matches)} matches`]
    ]);

    fillCards("playerOverviewStats", [
      ["Matches", integer(matches), `${integer(totals.wins)} W · ${integer(totals.losses)} L · ${integer(totals.draws)} D`],
      ["Rounds", integer(totals.rounds), `${integer(totals.round_wins)} won`],
      ["Kills", integer(totals.kills)],
      ["Deaths", integer(totals.deaths)],
      ["Assists", integer(totals.assists)],
      ["Headshot rate", percent(100 * ratio(totals.headshots, totals.kills)), `${integer(totals.headshots)} headshots`]
    ]);

    const utilityDamage = number(utility.he_damage) + number(utility.fire_damage);
    fillCards("playerUtilityStats", [
      ["Utility damage", integer(utilityDamage), `${decimal(utilityDamage / Math.max(1, number(totals.rounds)), 1)} per round`],
      ["HE damage", integer(utility.he_damage)],
      ["Fire damage", integer(utility.fire_damage)],
      ["Enemies flashed", integer(utility.enemies_flashed)],
      ["Flash assists", integer(utility.flash_assists)],
      ["Enemy blind time", `${decimal(utility.blind_duration_seconds, 1)}s`]
    ]);

    fillCards("playerTradeStats", [
      ["Trade kills", integer(trades.kills)],
      ["Opportunities", integer(trades.opportunities)],
      ["Attempts", integer(trades.attempts), `${percent(100 * ratio(trades.attempts, trades.opportunities))} attempt rate`],
      ["Successful trades", integer(trades.successes), `${percent(100 * ratio(trades.successes, trades.attempts))} success rate`],
      ["Tradeable deaths", integer(trades.tradeable_deaths)],
      ["Deaths attempted", integer(trades.attempted_tradeable_deaths), `${percent(100 * ratio(trades.attempted_tradeable_deaths, trades.tradeable_deaths))} response rate`],
      ["Deaths traded", integer(trades.traded_deaths), `${percent(100 * ratio(trades.traded_deaths, trades.attempted_tradeable_deaths))} success rate`]
    ]);

    const openingTotal = number(openings.kills) + number(openings.deaths);
    fillCards("playerOpeningStats", [
      ["Opening kills", integer(openings.kills)],
      ["Opening deaths", integer(openings.deaths)],
      ["Opening differential", `${number(openings.kills) - number(openings.deaths) >= 0 ? "+" : ""}${integer(number(openings.kills) - number(openings.deaths))}`],
      ["Opening success", percent(100 * ratio(openings.kills, openingTotal)), `${integer(openingTotal)} opening duels`]
    ]);

    renderTable($("playerWeaponsTable"), ["Weapon", "Kills", "Damage", "Shots", "Rounds used"], weapons.map(weapon => [
      titleCase(weapon.weapon), integer(weapon.kills), integer(weapon.damage), integer(weapon.shots), integer(weapon.rounds_used)
    ]));
    renderTable($("playerMapsTable"), ["Map", "Matches", "Record", "Win rate", "Rating", "K/D", "ADR", "KAST"], maps.map(map => [
      titleCase(String(map.map || "").replace(/^de_/, "")), integer(map.matches), `${integer(map.wins)}–${integer(map.losses)}`,
      percent(map.win_rate), decimal(map.rating, 2), decimal(map.kd, 2), decimal(map.adr, 1), percent(map.kast)
    ]));

    $("playerProfile").hidden = false;
    $("playerProfileStatus").textContent = "";
    setPlayerView("overview");
  }

  async function loadProfile(playerID) {
    profileController?.abort();
    profileController = new AbortController();
    $("playerProfile").hidden = false;
    $("playerProfileStatus").textContent = "Loading player profile…";
    $("playerProfileStatus").classList.remove("error");
    $("playerHeadlineStats").replaceChildren();
    try {
      const payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}/${encodeURIComponent(playerID)}`, {
        headers: { "Accept": "application/json" },
        signal: profileController.signal
      }));
      renderProfile(payload);
      $("playerProfile").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (error.name === "AbortError") return;
      $("playerProfileStatus").textContent = `Could not load player: ${error.message}`;
      $("playerProfileStatus").classList.add("error");
    }
  }

  $("playerSearchForm").addEventListener("submit", event => {
    event.preventDefault();
    clearTimeout(searchTimer);
    searchPlayers();
  });
  $("playerSearchInput").addEventListener("input", event => {
    clearTimeout(searchTimer);
    const query = event.target.value.trim();
    if (!query) {
      searchController?.abort();
      $("playerSearchResults").replaceChildren();
      setSearchStatus("Search for a player to open their profile.");
      return;
    }
    if (query.length < 2) return;
    searchTimer = setTimeout(searchPlayers, 250);
  });
  document.querySelectorAll("[data-player-view]").forEach(button => {
    button.addEventListener("click", () => setPlayerView(button.dataset.playerView));
  });
})();
