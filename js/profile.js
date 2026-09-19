(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const availability = window.NickStatsAvailability;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const integer = value => Math.round(number(value)).toLocaleString();
  const decimal = (value, places = 1) => number(value).toFixed(places);
  const percent = value => `${decimal(value, 1)}%`;
  const ratio = (a, b) => number(b) > 0 ? number(a) / number(b) : number(a);
  const titleCase = value => {
    const normalized = String(value || "Unknown").replace(/^weapon_/, "");
    const weaponNames = { hkp2000: "P2000", m4a1: "M4A4", m4a1_silencer: "M4A1-S", usp_silencer: "USP-S" };
    return weaponNames[normalized] || normalized.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
  };
  const countPerRound = (value, rounds, places = 2) => `${decimal(ratio(value, rounds), places)} per round`;
  const perGrenade = (value, grenades, label, places = 2, unit = "") => number(grenades) > 0
    ? `${decimal(number(value) / number(grenades), places)}${unit} per ${label}`
    : `— per ${label}`;
  const elapsed = milliseconds => {
    if (!Number.isFinite(Number(milliseconds))) return "—";
    const seconds = Math.max(0, number(milliseconds) / 1000), minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
  };
  const tableSorts = new Map();

  function card(label, value, note = "", className = "") {
    const element = document.createElement("div"); element.className = `player-stat-card ${className}`.trim();
    const name = document.createElement("span"); name.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value; element.append(name, strong);
    if (note) { const detail = document.createElement("small"); detail.textContent = note; element.appendChild(detail); }
    return element;
  }

  function fillCards(target, cards) { $(target).replaceChildren(...cards.map(values => card(...values))); }
  function fillList(target, metrics) {
    $(target).replaceChildren(...metrics.map(([label, value, note = ""]) => {
      const row = document.createElement("div"); row.className = "player-metric-row";
      const copy = document.createElement("div"), name = document.createElement("span"); name.textContent = label; copy.appendChild(name);
      if (note) { const detail = document.createElement("small"); detail.textContent = note; copy.appendChild(detail); }
      const strong = document.createElement("strong"); strong.textContent = value; row.append(copy, strong); return row;
    }));
  }
  function fillStrip(target, metrics) {
    $(target).replaceChildren(...metrics.map(([label, value, note = ""]) => {
      const item = document.createElement("div"); item.className = "player-count-item";
      const strong = document.createElement("strong"); strong.textContent = value;
      const name = document.createElement("span"); name.textContent = label; item.append(strong, name);
      if (note) { const detail = document.createElement("small"); detail.textContent = note; item.appendChild(detail); }
      return item;
    }));
  }
  function renderTable(target, headers, rows, sortRows = rows) {
    const table = typeof target === "string" ? $(target) : target;
    const tableKey = table.id || String(target);
    const sort = tableSorts.get(tableKey);
    const indexed = rows.map((values, index) => ({ values, sortValues: sortRows[index] || values, index }));
    if (sort) indexed.sort((left, right) => {
      const a = left.sortValues[sort.column], b = right.sortValues[sort.column];
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return (sort.direction === "asc" ? comparison : -comparison) || left.index - right.index;
    });
    const head = document.createElement("thead"), headerRow = document.createElement("tr");
    headers.forEach((label, column) => {
      const cell = document.createElement("th"); cell.scope = "col";
      const button = document.createElement("button"); button.type = "button"; button.className = "player-table-sort-button";
      const active = sort?.column === column;
      if (active) { button.classList.add("active"); button.dataset.direction = sort.direction; }
      button.textContent = label;
      button.title = active ? `Sorted ${sort.direction === "asc" ? "ascending" : "descending"}; click to reverse` : `Sort by ${label}`;
      cell.setAttribute("aria-sort", active ? (sort.direction === "asc" ? "ascending" : "descending") : "none");
      button.addEventListener("click", () => {
        const direction = active ? (sort.direction === "asc" ? "desc" : "asc") : (column === 0 ? "asc" : "desc");
        tableSorts.set(tableKey, { column, direction });
        renderTable(table, headers, rows, sortRows);
      });
      cell.appendChild(button); headerRow.appendChild(cell);
    }); head.appendChild(headerRow);
    const body = document.createElement("tbody");
    indexed.forEach(({ values }) => { const row = document.createElement("tr"); values.forEach((value, index) => { const cell = document.createElement(index ? "td" : "th"); if (!index) cell.scope = "row"; cell.textContent = value; row.appendChild(cell); }); body.appendChild(row); });
    table.replaceChildren(head, body);
  }

  function render({ prefix, headlineId, summary, side, result = "ALL", roundResult = "ALL", maps }) {
    const rawStats = summary.stats || {}, s = availability.materialize(rawStats), rounds = number(s.rounds), sideAll = side === "ALL";
    const statAvailable = key => availability.available(rawStats, key);
    const statInteger = key => statAvailable(key) ? integer(s[key]) : "—";
    const availabilityNote = (key, note) => {
      const compatibleRounds = availability.rounds(rawStats, key);
      return compatibleRounds < rounds ? `${note} · ${integer(compatibleRounds)} compatible rounds` : note;
    };
    const statPerRound = (key, places = 2) => statAvailable(key)
      ? availabilityNote(key, countPerRound(s[key], availability.rounds(rawStats, key), places))
      : "Not available in these demos";
    const statPerGrenadeAndRound = (key, grenadeKey, label, places = 2) => {
      const scoped = availability.scope(rawStats, key);
      if (!scoped || !number(scoped.rounds)) return "Not available in these demos";
      const note = `${perGrenade(scoped[key], scoped[grenadeKey], label, places)} · ${countPerRound(scoped[key], scoped.rounds)}`;
      return availabilityNote(key, note);
    };
    const metric = (label, value) => [label, integer(value), countPerRound(value, rounds)];
    const ratingClass = summary.rating >= 1.1 ? "rating-good" : summary.rating <= .9 ? "rating-bad" : "rating-average";
    const recordHeadline = roundResult === "ALL"
      ? [sideAll ? "Match win rate" : "Round win rate", percent(summary.winRate), sideAll ? `${summary.wins} wins in ${summary.matches} matches` : `${integer(s.round_wins)} of ${integer(rounds)} rounds`]
      : [roundResult === "win" ? "Winning rounds" : "Losing rounds", integer(rounds), "Filtered round sample"];
    fillCards(headlineId, [
      ["Average rating", decimal(summary.rating, 2), "Round-weighted", ratingClass], ["Average K/D", decimal(summary.kd, 2), `${integer(s.kills)} K · ${integer(s.deaths)} D`],
      ["Average ADR", decimal(summary.adr, 1), `${integer(s.damage)} total damage`], ["Average KAST", percent(summary.kast), `${integer(s.kast_rounds)} KAST rounds`],
      recordHeadline
    ]);
    const scoreCard = (label, sample, className) => {
      if (!sample?.count) return [label, "—", `No scored ${className === "player-score-win" ? "wins" : "losses"}`, className];
      const margin = number(sample.margin), sign = margin > 0 ? "+" : margin < 0 ? "−" : "";
      return [label, `${decimal(sample.for, 1)}–${decimal(sample.against, 1)}`, `${integer(sample.count)} scored match${sample.count === 1 ? "" : "es"} · ${sign}${decimal(Math.abs(margin), 1)} average margin`, className];
    };
    const roundWins = number(s.round_wins), roundLosses = Math.max(0, rounds - roundWins);
    const roundNote = roundResult === "ALL"
      ? `${integer(roundWins)} W · ${integer(roundLosses)} L · ${percent(100 * ratio(roundWins, rounds))}`
      : roundResult === "win" ? "Winning rounds only" : "Losing rounds only";
    const recordCards = [["Matches", integer(summary.matches), `${summary.wins} W · ${summary.losses} L · ${summary.draws} D`], ["Rounds", integer(rounds), roundNote]];
    if (result !== "l") recordCards.push(scoreCard("Average score when winning", summary.scores?.wins, "player-score-win"));
    if (result !== "w") recordCards.push(scoreCard("Average score when losing", summary.scores?.losses, "player-score-loss"));
    fillCards(`${prefix}RecordStats`, recordCards);
    const damageDifferential = number(s.damage) - number(s.damage_received);
    const killRateLabel = roundResult === "win" ? "KPRW" : roundResult === "loss" ? "KPRL" : "per round";
    fillCards(`${prefix}CombatStats`, [["Kills", integer(s.kills), `${decimal(ratio(s.kills, rounds), 2)} ${killRateLabel}`], ["Deaths", integer(s.deaths), countPerRound(s.deaths, rounds)], ["Assists", integer(s.assists), countPerRound(s.assists, rounds)], ["Headshot rate", percent(100 * ratio(s.headshots, s.kills)), `${integer(s.headshots)} headshots`], ["Damage received", integer(s.damage_received), countPerRound(s.damage_received, rounds, 1)], ["Damage differential", `${damageDifferential >= 0 ? "+" : ""}${integer(damageDifferential)}`, `${damageDifferential >= 0 ? "+" : ""}${decimal(ratio(damageDifferential, rounds), 1)} per round`]]);
    const utilityDamage = number(s.he_damage) + number(s.fire_damage);
    const damagingGrenades = number(s.he_grenades_thrown) + number(s.fire_grenades_thrown);
    fillCards(`${prefix}UtilityDamageStats`, [
      ["Total damage", integer(utilityDamage), `${perGrenade(utilityDamage, damagingGrenades, "damaging grenade", 1)} · ${countPerRound(utilityDamage, rounds, 1)}`],
      ["HE", integer(s.he_damage), `${perGrenade(s.he_damage, s.he_grenades_thrown, "HE", 1)} · ${countPerRound(s.he_damage, rounds, 1)}`],
      ["Fire", integer(s.fire_damage), `${perGrenade(s.fire_damage, s.fire_grenades_thrown, "fire grenade", 1)} · ${countPerRound(s.fire_damage, rounds, 1)}`]
    ]);
    fillCards(`${prefix}UtilityThrownStats`, [["HE", integer(s.he_grenades_thrown), countPerRound(s.he_grenades_thrown, rounds)], ["Flashes", integer(s.flashbangs_thrown), countPerRound(s.flashbangs_thrown, rounds)], ["Smokes", integer(s.smokes_thrown), countPerRound(s.smokes_thrown, rounds)], ["Fire", integer(s.fire_grenades_thrown), countPerRound(s.fire_grenades_thrown, rounds)], ["Decoys", integer(s.decoys_thrown), countPerRound(s.decoys_thrown, rounds)]]);
    const blindSeconds = number(s.blind_duration_ms) / 1000;
    fillCards(`${prefix}FlashStats`, [
      ["Enemies flashed", integer(s.enemies_flashed), `${perGrenade(s.enemies_flashed, s.flashbangs_thrown, "flash")} · ${countPerRound(s.enemies_flashed, rounds)}`],
      ["Enemy blind time", `${decimal(blindSeconds, 1)}s`, `${perGrenade(blindSeconds, s.flashbangs_thrown, "flash", 2, "s")} · ${decimal(ratio(blindSeconds, rounds), 2)}s per round`],
      ["Flash assists", statInteger("flash_assists"), statPerGrenadeAndRound("flash_assists", "flashbangs_thrown", "flash")]
    ]);
    fillCards(`${prefix}AssistStats`, [["Damage", integer(s.damage_assisted_kills), countPerRound(s.damage_assisted_kills, rounds)], ["Teammate flash", statInteger("teammate_flash_assisted_kills"), statPerRound("teammate_flash_assisted_kills")], ["Own flash", integer(s.own_flash_kills), `${perGrenade(s.own_flash_kills, s.flashbangs_thrown, "flash")} · ${countPerRound(s.own_flash_kills, rounds)}`]]);
    fillCards(`${prefix}TradeAttackStats`, [["Opportunities", integer(s.trade_opportunities), countPerRound(s.trade_opportunities, rounds)], ["Attempts", integer(s.trade_attempts), `${countPerRound(s.trade_attempts, rounds)} · ${percent(100 * ratio(s.trade_attempts, s.trade_opportunities))} response`], ["Trade kills", integer(s.trade_kills), `${countPerRound(s.trade_kills, rounds)} · ${integer(s.trade_successes)} successful responses · ${percent(100 * ratio(s.trade_successes, s.trade_attempts))} success`]]);
    fillCards(`${prefix}TradeDeathStats`, [["Tradeable deaths", integer(s.tradeable_deaths), countPerRound(s.tradeable_deaths, rounds)], ["Teammates attempted", integer(s.attempted_tradeable_deaths), `${countPerRound(s.attempted_tradeable_deaths, rounds)} · ${percent(100 * ratio(s.attempted_tradeable_deaths, s.tradeable_deaths))} response`], ["Deaths traded", integer(s.traded_deaths), `${countPerRound(s.traded_deaths, rounds)} · ${percent(100 * ratio(s.traded_deaths, s.attempted_tradeable_deaths))} conversion`]]);
    const openingTotal = number(s.opening_kills) + number(s.opening_deaths), openingDiff = number(s.opening_kills) - number(s.opening_deaths);
    const openingScope = key => availability.scope(rawStats, key);
    const openingPercent = (key, numerator, denominator) => {
      const scoped = openingScope(key);
      return scoped ? percent(100 * ratio(scoped[numerator], scoped[denominator])) : "—";
    };
    fillCards(`${prefix}OpeningStats`, [
      ["Opening kills", integer(s.opening_kills), countPerRound(s.opening_kills, rounds)],
      ["Opening deaths", integer(s.opening_deaths), countPerRound(s.opening_deaths, rounds)],
      ["Opening deaths traded", statInteger("opening_traded_deaths"), statAvailable("opening_traded_deaths") ? availabilityNote("opening_traded_deaths", `${openingPercent("opening_traded_deaths", "opening_traded_deaths", "opening_deaths")} of opening deaths`) : "Not available in these demos"],
      ["Opening trade kills", statInteger("opening_trade_kills"), statPerRound("opening_trade_kills")],
      ["Assisted opening kills", statInteger("opening_assisted_kills"), statAvailable("opening_assisted_kills") ? availabilityNote("opening_assisted_kills", `${openingPercent("opening_assisted_kills", "opening_assisted_kills", "opening_kills")} of opening kills`) : "Not available in these demos"],
      ["Opening assists earned", statInteger("opening_assists"), statPerRound("opening_assists")],
      ["Damage opening assists", statInteger("opening_damage_assists"), statPerRound("opening_damage_assists")],
      ["Flash opening assists", statInteger("opening_flash_assists"), statPerRound("opening_flash_assists")],
      ["Damage-assisted openings", statInteger("opening_damage_assisted_kills"), statPerRound("opening_damage_assisted_kills")],
      ["Flash-assisted openings", statInteger("opening_flash_assisted_kills"), statPerRound("opening_flash_assisted_kills")],
      ["Opening kill: enemy blinded", statInteger("opening_blinded_enemy_kills"), statPerRound("opening_blinded_enemy_kills")],
      ["Opening kill: player blinded", statInteger("opening_blind_kills"), statPerRound("opening_blind_kills")],
      ["Opening death: player blinded", statInteger("opening_deaths_while_blind"), statPerRound("opening_deaths_while_blind")],
      ["Opening death: enemy blinded", statInteger("opening_deaths_to_blind_killer"), statPerRound("opening_deaths_to_blind_killer")],
      ["Enemy-assisted opening deaths", statInteger("opening_enemy_assisted_deaths"), statAvailable("opening_enemy_assisted_deaths") ? availabilityNote("opening_enemy_assisted_deaths", `${openingPercent("opening_enemy_assisted_deaths", "opening_enemy_assisted_deaths", "opening_deaths")} of opening deaths`) : "Not available in these demos"],
      ["Enemy damage-assisted deaths", statInteger("opening_enemy_damage_assisted_deaths"), statPerRound("opening_enemy_damage_assisted_deaths")],
      ["Enemy flash-assisted deaths", statInteger("opening_enemy_flash_assisted_deaths"), statPerRound("opening_enemy_flash_assisted_deaths")],
      ["Opening attempt rate", percent(100 * ratio(openingTotal, rounds)), `${integer(openingTotal)} duels · ${countPerRound(openingTotal, rounds)}`],
      ["Opening differential", `${openingDiff >= 0 ? "+" : ""}${integer(openingDiff)}`, `${openingDiff >= 0 ? "+" : ""}${decimal(ratio(openingDiff, rounds), 2)} per round`],
      ["Opening success", percent(100 * ratio(s.opening_kills, openingTotal)), `${integer(s.opening_kills)} won · ${integer(s.opening_deaths)} lost`]
    ]);
    fillList(`${prefix}KillContextStats`, [["Clawback kills", s.clawback_kills], ["Enemy was blinded", s.blinded_kills], ["Player was blinded", s.blind_kills], ["Wallbang kills", s.wallbang_kills], ["Smoke kills", s.smoke_kills], ["Airborne kills", s.airborne_kills], ["Running kills", s.running_kills], ["Enemy had a grenade out", s.grenade_out_kills], ["Enemy had a knife out", s.knife_out_kills], ["Paul kills", s.equipment_disadvantage_kills], ["Bullshit kills (unique)", s.unfair_kills]].map(([label, value]) => metric(label, value)));
    fillList(`${prefix}DeathContextStats`, [["Bozo deaths", s.bozo_deaths], ["Player was blinded", s.deaths_while_blind], ["Enemy was blinded", s.deaths_to_blind_killer], ["Wallbang deaths", s.wallbang_deaths], ["Smoke deaths", s.smoke_deaths], ["Deaths to airborne enemies", s.airborne_deaths], ["Deaths to running enemies", s.running_killer_deaths], ["Player had a grenade out", s.grenade_out_deaths], ["Player had a knife out", s.knife_out_deaths], ["Paul deaths", s.equipment_disadvantage_deaths], ["Bullshit deaths (unique)", s.unfair_deaths]].map(([label, value]) => metric(label, value)));
    fillStrip(`${prefix}ClutchStats`, [1, 2, 3, 4, 5].map(opponents => {
      const wins = number(s[`clutch_1v${opponents}`]);
      const attempts = number(s[`clutch_attempt_1v${opponents}`]);
      return [`1v${opponents}`, `${integer(wins)} / ${integer(attempts)}`, `${percent(100 * ratio(wins, attempts))} won · ${integer(Math.max(0, attempts - wins))} failed`];
    }));
    fillStrip(`${prefix}MultikillStats`, [["1 kill", s.kill_rounds_1k], ["2 kills", s.kill_rounds_2k], ["3 kills", s.kill_rounds_3k], ["4 kills", s.kill_rounds_4k], ["5 kills", s.kill_rounds_5k]].map(([label, value]) => [label, integer(value), `${decimal(ratio(value, rounds), 2)}/R`]));
    fillStrip(`${prefix}ObjectiveStats`, [["Bomb plants", s.bomb_plants], ["Bomb defuses", s.bomb_defuses]].map(([label, value]) => [label, integer(value), countPerRound(value, rounds)]));
    const economyTypes = [["Pistol", "pistol"], ["Eco", "eco"], ["Force buy", "force"], ["Full buy", "full"]];
    fillStrip(`${prefix}EconomyStats`, economyTypes.map(([label, key]) => {
      const buyRounds = number(s[`economy_${key}_rounds`]);
      const wins = number(s[`economy_${key}_wins`]);
      const equipment = number(s[`economy_${key}_equipment_value`]);
      return [label, buyRounds ? `${integer(wins)} / ${integer(buyRounds)}` : "—",
        buyRounds ? `${percent(100 * ratio(wins, buyRounds))} won · $${integer(ratio(equipment, buyRounds))} average team value` : "No reparsed rounds"];
    }));
    const killTimeSamples = number(s.kill_time_samples), deathTimeSamples = number(s.death_time_samples);
    const postplantKills = number(s.postplant_kills), postplantDeaths = number(s.postplant_deaths);
    const timedRounds = number(s.timed_rounds);
    fillCards(`${prefix}TimingAverageStats`, [
      ["Average kill time", killTimeSamples ? elapsed(number(s.kill_time_total_ms) / killTimeSamples) : "—", `${integer(killTimeSamples)} timed kills`],
      ["Average death time", deathTimeSamples ? elapsed(number(s.death_time_total_ms) / deathTimeSamples) : "—", `${integer(deathTimeSamples)} timed deaths`],
      ["After-plant kill time", postplantKills ? `${decimal(ratio(s.postplant_kill_time_total_ms, postplantKills) / 1000, 1)}s` : "—", "Time since bomb plant"],
      ["After-plant death time", postplantDeaths ? `${decimal(ratio(s.postplant_death_time_total_ms, postplantDeaths) / 1000, 1)}s` : "—", "Time since bomb plant"]
    ]);
    fillStrip(`${prefix}PhaseStats`, [
      ["Early", s.early_kills, s.early_deaths, "0–25 seconds"],
      ["Mid", s.mid_kills, s.mid_deaths, "25–75 seconds"],
      ["Late", s.late_kills, s.late_deaths, "75+ seconds, pre-plant"],
      ["Post-plant", s.postplant_kills, s.postplant_deaths, "After the bomb is planted"]
    ].map(([label, kills, deaths, note]) => [
      label,
      `${integer(kills)} K / ${integer(deaths)} D`,
      timedRounds ? `${note} · ${decimal(ratio(kills, timedRounds), 2)} K/TR · ${decimal(ratio(deaths, timedRounds), 2)} D/TR` : `${note} · no reparsed rounds`
    ]));
    fillCards(`${prefix}KillSpeedStats`, [["Average", decimal(ratio(s.kill_speed_total, s.kill_speed_samples), 1), `${integer(s.kill_speed_samples)} samples`], ["Maximum", decimal(s.kill_speed_max, 1)], ["Average of max", percent(ratio(s.kill_speed_percent_total, s.kill_speed_percent_samples))], ["Peak of max", percent(s.kill_speed_percent_max)]]);
    fillCards(`${prefix}DeathSpeedStats`, [["Average", decimal(ratio(s.death_speed_total, s.death_speed_samples), 1), `${integer(s.death_speed_samples)} samples`], ["Maximum", decimal(s.death_speed_max, 1)], ["Average of max", percent(ratio(s.death_speed_percent_total, s.death_speed_percent_samples))], ["Peak of max", percent(s.death_speed_percent_max)]]);
    fillList(`${prefix}MovementStateStats`, [["Moving kills", s.moving_kills], ["Still kills", s.still_kills], ["Running kills", s.running_kills], ["Airborne kills", s.airborne_kills]].map(([label, value]) => metric(label, value)));
    fillList(`${prefix}DeathMovementStateStats`, [["Deaths to moving enemies", s.moving_killer_deaths], ["Deaths to still enemies", s.still_killer_deaths], ["Deaths to running enemies", s.running_killer_deaths], ["Deaths to airborne enemies", s.airborne_deaths]].map(([label, value]) => metric(label, value)));
    const weapons = summary.weapons || [];
    renderTable(`${prefix}WeaponsTable`, ["Weapon", "Kills", "K/RU", "Damage", "Dmg/RU", "Shots", "Hits", "Hit rate", "Rounds used", "Usage"], weapons.map(weapon => [titleCase(weapon.weapon), integer(weapon.kills), decimal(ratio(weapon.kills, weapon.rounds_used), 3), integer(weapon.damage), decimal(ratio(weapon.damage, weapon.rounds_used), 1), integer(weapon.shots), integer(weapon.hits), percent(100 * ratio(weapon.hits, weapon.shots)), integer(weapon.rounds_used), percent(100 * ratio(weapon.rounds_used, rounds))]), weapons.map(weapon => [weapon.weapon, number(weapon.kills), ratio(weapon.kills, weapon.rounds_used), number(weapon.damage), ratio(weapon.damage, weapon.rounds_used), number(weapon.shots), number(weapon.hits), ratio(weapon.hits, weapon.shots), number(weapon.rounds_used), ratio(weapon.rounds_used, rounds)]));
    const mapRows = maps || [];
    renderTable(`${prefix}MapsTable`, ["Map", "Matches", sideAll ? "Record" : "Rounds", sideAll ? "Win rate" : "Round win", "Rating", "K/D", "K/R", "A/R", "ADR", "KAST"], mapRows.map(({ name, summary: map }) => [titleCase(String(name).replace(/^de_/, "")), integer(map.matches), sideAll ? `${map.wins}–${map.losses}` : `${integer(map.stats.round_wins)}–${integer(map.rounds - number(map.stats.round_wins))}`, percent(map.winRate), decimal(map.rating, 2), decimal(map.kd, 2), decimal(ratio(map.stats.kills, map.rounds), 2), decimal(ratio(map.stats.assists, map.rounds), 2), decimal(map.adr, 1), percent(map.kast)]), mapRows.map(({ name, summary: map }) => [name, map.matches, sideAll ? map.wins - map.losses : number(map.stats.round_wins) - (map.rounds - number(map.stats.round_wins)), map.winRate, map.rating, map.kd, ratio(map.stats.kills, map.rounds), ratio(map.stats.assists, map.rounds), map.adr, map.kast]));
  }

  function mountComparisonProfile() {
    const source = $("playerProfileBody"), target = $("comboProfileBody");
    if (!source || !target) return;
    const component = source.cloneNode(true); component.removeAttribute("id");
    component.querySelectorAll("[data-standalone-profile-only]").forEach(element => element.remove());
    component.querySelectorAll("[id]").forEach(element => {
      if (element.id.startsWith("player")) element.id = `combo${element.id.slice("player".length)}`;
    });
    component.querySelectorAll("[data-player-view]").forEach(element => {
      element.dataset.comboProfileView = element.dataset.playerView; delete element.dataset.playerView;
    });
    component.querySelectorAll("[data-player-profile-view]").forEach(element => {
      element.dataset.comboProfilePanel = element.dataset.playerProfileView; delete element.dataset.playerProfileView;
    });
    const tabs = component.querySelector(".player-profile-tabs");
    if (tabs) tabs.setAttribute("aria-label", "Conditional player statistics");
    target.replaceChildren(...component.childNodes);
  }

  window.NickStatsProfile = Object.freeze({ render, renderTable, number, integer, decimal, percent, ratio, titleCase, countPerRound, perGrenade });
  mountComparisonProfile();
})();
