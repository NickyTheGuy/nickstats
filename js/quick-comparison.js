(() => {
  "use strict";

  const number = value => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  };
  const availability = window.NickStatsAvailability;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const signed = value => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(number(value)).toFixed(0)}`;
  const seconds = value => Number.isFinite(Number(value)) ? `${number(value).toFixed(1)}s` : "—";
  const SECTION_STORAGE_KEY = "nickstats.quickComparisonSections.v2";
  const sectionOptions = Object.freeze([
    ["overview", "Overview", ["combat"], "overview"], ["opening", "Opening", ["opening"], "opening"],
    ["trades", "Trades", ["trades"], "trades"], ["rounds", "Rounds", ["clutches", "multikills", "objectives"], "rounds"],
    ["roundState", "Round state", ["roundState", "killStage", "timing"], "roundState"],
    ["context", "Context", ["killContext"], "killContext"], ["movement", "Movement", ["movement"], "movement"],
    ["utility", "Utility", ["utility"], "utility"]
  ]);
  const columnGroups = Object.freeze([
    ["combat", "Overview"], ["opening", "Opening"], ["trades", "Trades"], ["clutches", "Clutches"],
    ["multikills", "Kill rounds"], ["objectives", "Objectives"], ["roundState", "Man count"],
    ["killStage", "Kill stage"], ["timing", "Round timing"], ["killContext", "Context"],
    ["movement", "Movement"], ["utility", "Utility"]
  ]);
  const groupSection = Object.freeze(Object.fromEntries(sectionOptions.flatMap(([section, , groups]) => groups.map(group => [group, section]))));
  const sectionKeys = new Set(sectionOptions.map(([key]) => key));
  const defaultSections = ["overview", "opening", "rounds"];
  const sectionSubgroups = Object.freeze({
    combat: [["output", "Output", [0, 1, 2, 3, 4]], ["damage", "Damage", [5, 6, 7, 8]]],
    opening: [["results", "Results", [0, 1, 24, 25, 26]], ["received", "Help received", [2, 3, 4, 5, 23]], ["given", "Help given", [6, 7, 8, 9]], ["flash", "Flash context", [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]]],
    killContext: [["visibility", "Visibility and cover", [0, 1, 2, 3, 4]], ["readiness", "Readiness", [5, 6, 7, 8]]],
    movement: [["state", "State", [0, 1, 2, 3]], ["speed", "Speed", [4, 5, 6, 7]]],
    utility: [["damage", "Damage", [0, 1]], ["usage", "Usage", [2, 3, 4, 5, 6]], ["flashes", "Flash effects", [7, 8, 9, 10, 11, 12, 13]], ["assists", "Assisted kills", [14, 15, 16]]]
  });
  const storedSections = () => {
    try {
      const values = JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY));
      return Array.isArray(values) ? values.filter(value => sectionKeys.has(value)) : defaultSections;
    } catch (_) {
      return defaultSections;
    }
  };
  let sharedSections = new Set(storedSections());
  const sectionSubscribers = new Set();

  function setSharedSections(values) {
    sharedSections = new Set(values);
    try { localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify([...sharedSections])); } catch (_) {}
    sectionSubscribers.forEach(subscriber => subscriber(sharedSections));
  }

  function create({ prefix }) {
    const state = {
      map: "ALL",
      expandedGroups: Object.fromEntries(columnGroups.map(([key]) => [key, false])),
      sectionSubgroups: {},
      valueMode: "totals",
      perGrenadeUtility: false,
      visibleSections: new Set(sharedSections),
      sort: null,
      input: null
    };
    const byId = suffix => document.getElementById(`${prefix}Quick${suffix}`);
    const { integer, decimal, percent, titleCase } = window.NickStatsProfile;

    function mapsFor(players) {
      return [...new Set(players.flatMap(player => player.rows || []).map(row => row.map).filter(Boolean))]
        .sort((left, right) => titleCase(left.replace(/^de_/, "")).localeCompare(titleCase(right.replace(/^de_/, ""))));
    }

    function focusedColumns(group, columns) {
      if (!state.expandedGroups[group] || !sectionSubgroups[group]) return columns;
      const subgroup = activeSubgroup(group);
      return subgroup[2].map(index => columns[index]).filter(Boolean);
    }

    function activeSubgroup(group) {
      const subgroups = sectionSubgroups[group];
      if (!subgroups) return null;
      const active = state.sectionSubgroups[group] || subgroups[0][0];
      return subgroups.find(([key]) => key === active) || subgroups[0];
    }

    function cycleSubgroup(group) {
      const subgroups = sectionSubgroups[group];
      if (!subgroups) return;
      const active = activeSubgroup(group);
      const index = Math.max(0, subgroups.findIndex(([key]) => key === active[0]));
      state.sectionSubgroups[group] = subgroups[(index + 1) % subgroups.length][0];
      if (state.sort?.group === group) state.sort = null;
      render(state.input);
    }

    const groupVisible = group => state.visibleSections.has(groupSection[group]);

    function displayedValue(column, item) {
      if (state.valueMode === "totals" || !column.group) return column.format(item);
      const formatted = column.format(item);
      if (formatted === "—" || formatted === "Not parsed") return formatted;
      const value = column.value(item);
      if (!Number.isFinite(Number(value))) return column.format(item);
      if (/rate|success|percent|\bkd\b|adr|speed/.test(column.key) || (/^[-+−]?\d+(?:\.\d+)?%$/.test(formatted)) || ["timing-kill", "timing-death"].includes(column.key)) return formatted;
      let denominator = state.valueMode === "match" ? item.rows.length : number(item.stats.rounds);
      if (column.group === "utility" && state.perGrenadeUtility) {
        if (["utility-he-damage"].includes(column.key)) denominator = number(item.stats.he_grenades_thrown);
        else if (["utility-fire-damage"].includes(column.key)) denominator = number(item.stats.fire_grenades_thrown);
        else if (["utility-enemies-flashed", "utility-blind-seconds", "utility-teammates-flashed", "utility-teammate-blind-seconds", "utility-self-flashes", "utility-self-blind-seconds", "utility-flash-assists", "utility-own-flash"].includes(column.key)) denominator = number(item.stats.flashbangs_thrown);
      }
      if (!denominator) return "—";
      const kda = formatted.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
      if (kda) return kda.slice(1).map(part => decimal(number(part) / denominator, 2)).join("-");
      const opening = formatted.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?) · (.+)$/);
      if (opening) return `${decimal(number(opening[1]) / denominator, 2)}-${decimal(number(opening[2]) / denominator, 2)} · ${opening[3]}`;
      const pair = formatted.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
      if (pair) return `${decimal(number(pair[1]) / denominator, 2)}-${decimal(number(pair[2]) / denominator, 2)}`;
      const fraction = formatted.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      if (fraction) return `${decimal(number(fraction[1]) / denominator, 2)}/${decimal(number(fraction[2]) / denominator, 2)}`;
      const triple = formatted.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      if (triple) return triple.slice(1).map(part => decimal(number(part) / denominator, 2)).join("/");
      const utilitySummary = formatted.match(/^(\d+(?:\.\d+)?) dmg · (\d+(?:\.\d+)?) thrown$/);
      if (utilitySummary) return `${decimal(number(utilitySummary[1]) / denominator, 2)} dmg · ${decimal(number(utilitySummary[2]) / denominator, 2)} thrown`;
      const countedPercent = formatted.match(/^(\d+(?:\.\d+)?) (\([^)]+\))$/);
      if (countedPercent) return `${decimal(number(countedPercent[1]) / denominator, 2)} ${countedPercent[2]}`;
      const scaledValue = ["utility-blind-seconds", "utility-teammate-blind-seconds", "utility-self-blind-seconds"].includes(column.key)
        ? number(value) / 1000 : number(value);
      return decimal(scaledValue / denominator, 2);
    }

    function displayedLabel(column) {
      if (state.valueMode === "totals" || !column.group) return column.label;
      const grenadeUnit = state.perGrenadeUtility && column.group === "utility" ? {
        "utility-he-damage": "HE", "utility-fire-damage": "fire", "utility-enemies-flashed": "flash",
        "utility-blind-seconds": "flash", "utility-teammates-flashed": "flash", "utility-teammate-blind-seconds": "flash",
        "utility-self-flashes": "flash", "utility-self-blind-seconds": "flash", "utility-flash-assists": "flash", "utility-own-flash": "flash"
      }[column.key] : null;
      const unit = grenadeUnit || (state.valueMode === "match" ? "match" : "round");
      if (/rate|success|percent|\bkd\b|adr|speed/.test(column.key) || (column.label.endsWith("%") && !column.label.includes("(Succ%)")) || ["timing-kill", "timing-death"].includes(column.key)) return column.label;
      const compositeLabels = {
        combat: `K/${unit}-D/${unit}-A/${unit}`,
        opening: `K/${unit}-D/${unit} · Att%`,
        trades: `K/${unit}-D/${unit}`,
        clutches: `W/${unit} / A/${unit}`,
        "round-state": `Clawback K/${unit}-Bozo D/${unit}`,
        "kill-context": `Bullshit K/${unit}-D/${unit}`,
        "kill-stage-summary": `5 alive K/${unit} / 1 alive K/${unit}`,
        movement: `Move/run/air / ${unit}`,
        utility: `Damage/${unit} · thrown/${unit}`,
        multikills: `Total / ${unit}`,
        objectives: `Plants/${unit} / defuses/${unit}`
      };
      if (compositeLabels[column.key]) return compositeLabels[column.key];
      if (column.label.includes("K-D")) return column.label.replace("K-D", `K/${unit}-D/${unit}`);
      if (column.label === "Advantage K / Outnumbered D") return `Advantage K/${unit} / Outnumbered D/${unit}`;
      if (column.label.includes("(Succ%)")) return column.label.replace(/^([KD])/, `$1 / ${unit}`);
      return `${column.label} / ${unit}`;
    }

    function estimatedColumnWidth(label, values, firstColumn = false) {
      const estimatedTextWidth = text => 26 + [...String(text ?? "")].reduce((width, character) =>
        width + (/[MW@#%]/.test(character) ? 9 : /[il1 .·]/.test(character) ? 4 : 7), 0);
      return Math.max(firstColumn ? 160 : 58, estimatedTextWidth(label) + 16,
        ...values.map(value => estimatedTextWidth(value)));
    }

    function renderTable(comparison) {
      const clutchValue = (stats, statPrefix, size) => number(stats[`${statPrefix}_1v${size}`]);
      const clutchTotal = (stats, statPrefix) => [1, 2, 3, 4, 5].reduce((total, size) => total + clutchValue(stats, statPrefix, size), 0);
      const fixedColumns = [
        { key: "player", label: "Player", value: item => item.player.label, format: item => item.player.label },
        { key: "rating", label: "Rating", value: item => item.stats.rating, format: item => decimal(item.stats.rating, 2), className: item => `demo-rating ${item.stats.rating >= 1.10 ? "rating-good" : item.stats.rating <= 0.90 ? "rating-bad" : "rating-average"}` },
        { key: "win-rate", label: "Win rate", value: item => item.stats.winRate, format: item => percent(item.stats.winRate) },
        { key: "rounds", label: "Rounds", value: item => number(item.stats.rounds), format: item => integer(item.stats.rounds) },
        { key: "kast", label: "KAST", value: item => item.stats.kast, format: item => percent(item.stats.kast) }
      ];
      const combatColumns = state.expandedGroups.combat ? [
        { key: "combat-k", label: "K", value: item => number(item.stats.kills), format: item => integer(item.stats.kills) },
        { key: "combat-d", label: "D", value: item => number(item.stats.deaths), format: item => integer(item.stats.deaths) },
        { key: "combat-a", label: "A", value: item => number(item.stats.assists), format: item => integer(item.stats.assists) },
        { key: "combat-kd", label: "K/D", value: item => item.stats.kd, format: item => decimal(item.stats.kd, 2) },
        { key: "combat-hs", label: "HS%", value: item => 100 * number(item.stats.headshots) / Math.max(1, number(item.stats.kills)), format: item => percent(100 * number(item.stats.headshots) / Math.max(1, number(item.stats.kills))) },
        { key: "combat-damage", label: "Damage", value: item => number(item.stats.damage), format: item => integer(item.stats.damage) },
        { key: "combat-received", label: "Received", value: item => number(item.stats.damage_received), format: item => integer(item.stats.damage_received) },
        { key: "combat-diff", label: "Diff", value: item => number(item.stats.damage) - number(item.stats.damage_received), format: item => signed(number(item.stats.damage) - number(item.stats.damage_received)) },
        { key: "combat-adr", label: "ADR", value: item => item.stats.adr, format: item => decimal(item.stats.adr, 1) }
      ] : [{
        key: "combat", label: "K-D-A", value: item => number(item.stats.kills),
        format: item => `${integer(item.stats.kills)}-${integer(item.stats.deaths)}-${integer(item.stats.assists)}`
      }];
      const openingColumns = state.expandedGroups.opening ? [
        { key: "opening-k", label: "K", value: item => number(item.stats.opening_kills), format: item => integer(item.stats.opening_kills) },
        { key: "opening-d", label: "D", value: item => number(item.stats.opening_deaths), format: item => integer(item.stats.opening_deaths) },
        { key: "opening-assisted", label: "Assisted K", value: item => item.stats.opening_assisted_kills, format: item => availability.available(item.stats, "opening_assisted_kills") ? integer(item.stats.opening_assisted_kills) : "—" },
        { key: "opening-damage-assisted", label: "Dmg A", value: item => item.stats.opening_damage_assisted_kills, format: item => availability.available(item.stats, "opening_damage_assisted_kills") ? integer(item.stats.opening_damage_assisted_kills) : "—" },
        { key: "opening-flash-assisted", label: "Flash A", value: item => item.stats.opening_flash_assisted_kills, format: item => availability.available(item.stats, "opening_flash_assisted_kills") ? integer(item.stats.opening_flash_assisted_kills) : "—" },
        { key: "opening-traded-deaths", label: "Traded D", value: item => item.stats.opening_traded_deaths, format: item => availability.available(item.stats, "opening_traded_deaths") ? integer(item.stats.opening_traded_deaths) : "—" },
        { key: "opening-trade-kills", label: "Trade K", value: item => item.stats.opening_trade_kills, format: item => availability.available(item.stats, "opening_trade_kills") ? integer(item.stats.opening_trade_kills) : "—" },
        { key: "opening-assists", label: "A earned", value: item => item.stats.opening_assists, format: item => availability.available(item.stats, "opening_assists") ? integer(item.stats.opening_assists) : "—" },
        { key: "opening-damage-assists", label: "Dmg A earned", value: item => item.stats.opening_damage_assists, format: item => availability.available(item.stats, "opening_damage_assists") ? integer(item.stats.opening_damage_assists) : "—" },
        { key: "opening-flash-assists", label: "Flash A earned", value: item => item.stats.opening_flash_assists, format: item => availability.available(item.stats, "opening_flash_assists") ? integer(item.stats.opening_flash_assists) : "—" },
        { key: "opening-blinded-enemy-kills", label: "Enemy blind K", value: item => item.stats.opening_blinded_enemy_kills, format: item => availability.available(item.stats, "opening_blinded_enemy_kills") ? integer(item.stats.opening_blinded_enemy_kills) : "—" },
        { key: "opening-blind-kills", label: "Blind K", value: item => item.stats.opening_blind_kills, format: item => availability.available(item.stats, "opening_blind_kills") ? integer(item.stats.opening_blind_kills) : "—" },
        { key: "opening-deaths-while-blind", label: "Blind D", value: item => item.stats.opening_deaths_while_blind, format: item => availability.available(item.stats, "opening_deaths_while_blind") ? integer(item.stats.opening_deaths_while_blind) : "—" },
        { key: "opening-deaths-to-blind-killer", label: "Blind killer D", value: item => item.stats.opening_deaths_to_blind_killer, format: item => availability.available(item.stats, "opening_deaths_to_blind_killer") ? integer(item.stats.opening_deaths_to_blind_killer) : "—" },
        { key: "opening-enemy-assisted-deaths", label: "Enemy assisted D", value: item => item.stats.opening_enemy_assisted_deaths, format: item => availability.available(item.stats, "opening_enemy_assisted_deaths") ? integer(item.stats.opening_enemy_assisted_deaths) : "—" },
        { key: "opening-enemy-damage-assisted-deaths", label: "Enemy dmg A D", value: item => item.stats.opening_enemy_damage_assisted_deaths, format: item => availability.available(item.stats, "opening_enemy_damage_assisted_deaths") ? integer(item.stats.opening_enemy_damage_assisted_deaths) : "—" },
        { key: "opening-enemy-flash-assisted-deaths", label: "Enemy flash A D", value: item => item.stats.opening_enemy_flash_assisted_deaths, format: item => availability.available(item.stats, "opening_enemy_flash_assisted_deaths") ? integer(item.stats.opening_enemy_flash_assisted_deaths) : "—" },
        { key: "opening-own-flash-kills", label: "Own flash K", value: item => item.stats.opening_own_flash_kills, format: item => availability.available(item.stats, "opening_own_flash_kills") ? integer(item.stats.opening_own_flash_kills) : "—" },
        { key: "opening-victim-side-flash-kills", label: "Victim-side flash K", value: item => item.stats.opening_victim_side_flash_kills, format: item => availability.available(item.stats, "opening_victim_side_flash_kills") ? integer(item.stats.opening_victim_side_flash_kills) : "—" },
        { key: "opening-blind-source-unknown-kills", label: "Unknown flash K", value: item => item.stats.opening_blind_source_unknown_kills, format: item => availability.available(item.stats, "opening_blind_source_unknown_kills") ? integer(item.stats.opening_blind_source_unknown_kills) : "—" },
        { key: "opening-deaths-to-killer-flash", label: "Killer flash D", value: item => item.stats.opening_deaths_to_killer_flash, format: item => availability.available(item.stats, "opening_deaths_to_killer_flash") ? integer(item.stats.opening_deaths_to_killer_flash) : "—" },
        { key: "opening-deaths-to-own-side-flash", label: "Own-side flash D", value: item => item.stats.opening_deaths_to_own_side_flash, format: item => availability.available(item.stats, "opening_deaths_to_own_side_flash") ? integer(item.stats.opening_deaths_to_own_side_flash) : "—" },
        { key: "opening-deaths-blind-source-unknown", label: "Unknown flash D", value: item => item.stats.opening_deaths_blind_source_unknown, format: item => availability.available(item.stats, "opening_deaths_blind_source_unknown") ? integer(item.stats.opening_deaths_blind_source_unknown) : "—" },
        { key: "opening-assist-rate", label: "Assist %", value: item => item.stats.openingAssistRate, format: item => availability.available(item.stats, "openingAssistRate") ? percent(item.stats.openingAssistRate) : "—" },
        { key: "opening-attempt", label: "Attempt rate", value: item => item.stats.openingAttemptRate, format: item => percent(item.stats.openingAttemptRate) },
        { key: "opening-diff", label: "Diff", value: item => item.stats.openingDiff, format: item => signed(item.stats.openingDiff) },
        { key: "opening-success", label: "Success", value: item => item.stats.openingSuccess, format: item => percent(item.stats.openingSuccess) }
      ] : [{
        key: "opening", label: "K-D · Att%", value: item => item.stats.openingDiff,
        format: item => `${integer(item.stats.opening_kills)}-${integer(item.stats.opening_deaths)} · ${percent(item.stats.openingAttemptRate)}`
      }];
      const tradesColumns = state.expandedGroups.trades ? [
        { key: "trade-opportunities", label: "K Opp", value: item => number(item.stats.trade_opportunities), format: item => integer(item.stats.trade_opportunities) },
        { key: "trade-attempts", label: "K Att", value: item => number(item.stats.trade_attempts), format: item => integer(item.stats.trade_attempts) },
        { key: "trade-kills", label: "K (Succ%)", value: item => number(item.stats.trade_kills), format: item => `${integer(item.stats.trade_kills)} (${percent(100 * number(item.stats.trade_kills) / Math.max(1, number(item.stats.trade_attempts)))})` },
        { key: "tradeable-deaths", label: "D Opp", value: item => number(item.stats.tradeable_deaths), format: item => integer(item.stats.tradeable_deaths) },
        { key: "attempted-tradeable-deaths", label: "D Att", value: item => number(item.stats.attempted_tradeable_deaths), format: item => integer(item.stats.attempted_tradeable_deaths) },
        { key: "traded-deaths", label: "D (Succ%)", value: item => number(item.stats.traded_deaths), format: item => `${integer(item.stats.traded_deaths)} (${percent(100 * number(item.stats.traded_deaths) / Math.max(1, number(item.stats.attempted_tradeable_deaths)))})` }
      ] : [{
        key: "trades", label: "K-D", value: item => number(item.stats.trade_kills) - number(item.stats.traded_deaths),
        format: item => `${integer(item.stats.trade_kills)}-${integer(item.stats.traded_deaths)}`
      }];
      const clutchColumns = state.expandedGroups.clutches
        ? [5, 4, 3, 2, 1].map(size => ({
            key: `clutch-${size}`, label: `1v${size}`, value: item => clutchValue(item.stats, "clutch", size),
            format: item => `${integer(clutchValue(item.stats, "clutch", size))}/${integer(clutchValue(item.stats, "clutch_attempt", size))}`
          }))
        : [{
            key: "clutches", label: "Total W/A", value: item => clutchTotal(item.stats, "clutch"),
            format: item => `${integer(clutchTotal(item.stats, "clutch"))}/${integer(clutchTotal(item.stats, "clutch_attempt"))}`
          }];
      const roundStateColumns = state.expandedGroups.roundState ? [
        { key: "context-clawback-bozo", label: "Clawback-Bozo K-D", value: item => number(item.stats.clawback_kills) - number(item.stats.bozo_deaths), format: item => availability.available(item.stats, "clawback_kills") ? `${integer(item.stats.clawback_kills)}-${integer(item.stats.bozo_deaths)}` : "—" },
        { key: "context-even", label: "Even K-D", value: item => number(item.stats.even_kills) - number(item.stats.even_deaths), format: item => availability.available(item.stats, "even_kills") ? `${integer(item.stats.even_kills)}-${integer(item.stats.even_deaths)}` : "—" },
        { key: "context-advantage", label: "Advantage K / Outnumbered D", value: item => number(item.stats.advantage_kills) - number(item.stats.disadvantage_deaths), format: item => availability.available(item.stats, "advantage_kills") ? `${integer(item.stats.advantage_kills)}-${integer(item.stats.disadvantage_deaths)}` : "—" },
        { key: "context-cleanup", label: "Cleanup K-D", value: item => number(item.stats.cleanup_kills) - number(item.stats.cleanup_deaths), format: item => availability.available(item.stats, "cleanup_kills") ? `${integer(item.stats.cleanup_kills)}-${integer(item.stats.cleanup_deaths)}` : "—" }
      ] : [{
        key: "round-state", label: "Clawback-Bozo K-D", value: item => number(item.stats.clawback_kills) - number(item.stats.bozo_deaths),
        format: item => availability.available(item.stats, "clawback_kills") ? `${integer(item.stats.clawback_kills)}-${integer(item.stats.bozo_deaths)}` : "—"
      }];
      const contextColumns = state.expandedGroups.killContext ? [
        { key: "context-enemy-blind", label: "Enemy blind K-D", value: item => number(item.stats.blinded_kills) - number(item.stats.deaths_while_blind), format: item => `${integer(item.stats.blinded_kills)}-${integer(item.stats.deaths_while_blind)}` },
        { key: "context-killer-blind", label: "Killer blind K-D", value: item => number(item.stats.blind_kills) - number(item.stats.deaths_to_blind_killer), format: item => `${integer(item.stats.blind_kills)}-${integer(item.stats.deaths_to_blind_killer)}` },
        { key: "context-wallbang", label: "Wallbang K-D", value: item => number(item.stats.wallbang_kills) - number(item.stats.wallbang_deaths), format: item => `${integer(item.stats.wallbang_kills)}-${integer(item.stats.wallbang_deaths)}` },
        { key: "context-smoke", label: "Smoke K-D", value: item => number(item.stats.smoke_kills) - number(item.stats.smoke_deaths), format: item => `${integer(item.stats.smoke_kills)}-${integer(item.stats.smoke_deaths)}` },
        { key: "context-air", label: "Air K-D", value: item => number(item.stats.airborne_kills) - number(item.stats.airborne_deaths), format: item => `${integer(item.stats.airborne_kills)}-${integer(item.stats.airborne_deaths)}` },
        { key: "context-grenade", label: "Grenade out K-D", value: item => number(item.stats.grenade_out_kills) - number(item.stats.grenade_out_deaths), format: item => `${integer(item.stats.grenade_out_kills)}-${integer(item.stats.grenade_out_deaths)}` },
        { key: "context-knife", label: "Knife out K-D", value: item => number(item.stats.knife_out_kills) - number(item.stats.knife_out_deaths), format: item => `${integer(item.stats.knife_out_kills)}-${integer(item.stats.knife_out_deaths)}` },
        { key: "context-paul", label: "Paul K-D", value: item => number(item.stats.equipment_disadvantage_kills) - number(item.stats.equipment_disadvantage_deaths), format: item => `${integer(item.stats.equipment_disadvantage_kills)}-${integer(item.stats.equipment_disadvantage_deaths)}` },
        { key: "context-running", label: "Run K-D", value: item => number(item.stats.running_kills) - number(item.stats.running_killer_deaths), format: item => `${integer(item.stats.running_kills)}-${integer(item.stats.running_killer_deaths)}` }
      ] : [{
        key: "kill-context", label: "Bullshit K-D", value: item => number(item.stats.unfair_kills) - number(item.stats.unfair_deaths),
        format: item => `${integer(item.stats.unfair_kills)}-${integer(item.stats.unfair_deaths)}`
      }];
      const stageAvailable = (item, alive, kind = "kills") => availability.available(item.stats, `enemy_alive_${alive}_${kind}`);
      const stageColumns = state.expandedGroups.killStage ? [5, 4, 3, 2, 1].map(alive => ({
        key: `enemy-alive-${alive}`, label: `${alive} alive K-D`,
        value: item => number(item.stats[`enemy_alive_${alive}_kills`]) - number(item.stats[`enemy_alive_${alive}_deaths`]),
        format: item => stageAvailable(item, alive)
          ? `${integer(item.stats[`enemy_alive_${alive}_kills`])}-${integer(item.stats[`enemy_alive_${alive}_deaths`])}` : "—"
      })) : [{
        key: "kill-stage-summary", label: "5/1 alive K", value: item => number(item.stats.enemy_alive_5_kills) - number(item.stats.enemy_alive_1_kills),
        format: item => stageAvailable(item, 5)
          ? `${integer(item.stats.enemy_alive_5_kills)}/${integer(item.stats.enemy_alive_1_kills)}` : "—"
      }];
      const movementPair = (item, killKey, deathKey) => `${integer(item.stats[killKey])}-${integer(item.stats[deathKey])}`;
      const speedAverage = (item, totalKey, samplesKey) => number(item.stats[totalKey]) / Math.max(1, number(item.stats[samplesKey]));
      const speedPair = (item, totalKey, samplesKey, maximumKey, suffix = "") => {
        const average = speedAverage(item, totalKey, samplesKey), maximum = number(item.stats[maximumKey]);
        return `${decimal(average, 1)}${suffix}/${decimal(maximum, 1)}${suffix}`;
      };
      const movementColumns = state.expandedGroups.movement ? [
        { key: "movement-moving", label: "Move K-D", value: item => number(item.stats.moving_kills) - number(item.stats.moving_killer_deaths), format: item => movementPair(item, "moving_kills", "moving_killer_deaths") },
        { key: "movement-still", label: "Still K-D", value: item => number(item.stats.still_kills) - number(item.stats.still_killer_deaths), format: item => movementPair(item, "still_kills", "still_killer_deaths") },
        { key: "movement-running", label: "Run K-D", value: item => number(item.stats.running_kills) - number(item.stats.running_killer_deaths), format: item => movementPair(item, "running_kills", "running_killer_deaths") },
        { key: "movement-air", label: "Air K-D", value: item => number(item.stats.airborne_kills) - number(item.stats.airborne_deaths), format: item => movementPair(item, "airborne_kills", "airborne_deaths") },
        { key: "movement-kill-speed", label: "Kill speed avg/max", value: item => speedAverage(item, "kill_speed_total", "kill_speed_samples"), format: item => speedPair(item, "kill_speed_total", "kill_speed_samples", "kill_speed_max") },
        { key: "movement-kill-percent", label: "Kill speed avg/peak %", value: item => speedAverage(item, "kill_speed_percent_total", "kill_speed_percent_samples"), format: item => speedPair(item, "kill_speed_percent_total", "kill_speed_percent_samples", "kill_speed_percent_max", "%") },
        { key: "movement-death-speed", label: "Enemy speed avg/max", value: item => speedAverage(item, "death_speed_total", "death_speed_samples"), format: item => speedPair(item, "death_speed_total", "death_speed_samples", "death_speed_max") },
        { key: "movement-death-percent", label: "Enemy speed avg/peak %", value: item => speedAverage(item, "death_speed_percent_total", "death_speed_percent_samples"), format: item => speedPair(item, "death_speed_percent_total", "death_speed_percent_samples", "death_speed_percent_max", "%") }
      ] : [{
        key: "movement", label: "Move/run/air", value: item => number(item.stats.moving_kills),
        format: item => `${integer(item.stats.moving_kills)}/${integer(item.stats.running_kills)}/${integer(item.stats.airborne_kills)}`
      }];
      const utilityDamage = item => number(item.stats.he_damage) + number(item.stats.fire_damage);
      const utilityThrown = item => ["he_grenades_thrown", "flashbangs_thrown", "smokes_thrown", "fire_grenades_thrown", "decoys_thrown"].reduce((total, key) => total + number(item.stats[key]), 0);
      const availableInteger = (item, key) => availability.available(item.stats, key) ? integer(item.stats[key]) : "—";
      const utilityColumns = state.expandedGroups.utility ? [
        { key: "utility-he-damage", label: "HE Dmg", value: item => number(item.stats.he_damage), format: item => integer(item.stats.he_damage) },
        { key: "utility-fire-damage", label: "Fire Dmg", value: item => number(item.stats.fire_damage), format: item => integer(item.stats.fire_damage) },
        { key: "utility-he-thrown", label: "HE thrown", value: item => number(item.stats.he_grenades_thrown), format: item => integer(item.stats.he_grenades_thrown) },
        { key: "utility-flash-thrown", label: "Flash thrown", value: item => number(item.stats.flashbangs_thrown), format: item => integer(item.stats.flashbangs_thrown) },
        { key: "utility-smoke-thrown", label: "Smoke thrown", value: item => number(item.stats.smokes_thrown), format: item => integer(item.stats.smokes_thrown) },
        { key: "utility-fire-thrown", label: "Fire thrown", value: item => number(item.stats.fire_grenades_thrown), format: item => integer(item.stats.fire_grenades_thrown) },
        { key: "utility-decoy-thrown", label: "Decoy thrown", value: item => number(item.stats.decoys_thrown), format: item => integer(item.stats.decoys_thrown) },
        { key: "utility-enemies-flashed", label: "EF", value: item => number(item.stats.enemies_flashed), format: item => integer(item.stats.enemies_flashed) },
        { key: "utility-blind-seconds", label: "Enemy sec", value: item => number(item.stats.blind_duration_ms), format: item => decimal(number(item.stats.blind_duration_ms) / 1000, 1) },
        { key: "utility-teammates-flashed", label: "TF", value: item => number(item.stats.teammates_flashed), format: item => integer(item.stats.teammates_flashed) },
        { key: "utility-teammate-blind-seconds", label: "Teammate sec", value: item => number(item.stats.teammate_blind_duration_ms), format: item => decimal(number(item.stats.teammate_blind_duration_ms) / 1000, 1) },
        { key: "utility-self-flashes", label: "SF", value: item => number(item.stats.self_flashes), format: item => integer(item.stats.self_flashes) },
        { key: "utility-self-blind-seconds", label: "Self sec", value: item => number(item.stats.self_blind_duration_ms), format: item => decimal(number(item.stats.self_blind_duration_ms) / 1000, 1) },
        { key: "utility-flash-assists", label: "FA", value: item => number(item.stats.flash_assists), format: item => availableInteger(item, "flash_assists") },
        { key: "utility-damage-assists", label: "Damage assist", value: item => number(item.stats.damage_assisted_kills), format: item => integer(item.stats.damage_assisted_kills) },
        { key: "utility-teammate-flash", label: "Teammate flash", value: item => number(item.stats.teammate_flash_assisted_kills), format: item => availableInteger(item, "teammate_flash_assisted_kills") },
        { key: "utility-own-flash", label: "Own flash", value: item => number(item.stats.own_flash_kills), format: item => integer(item.stats.own_flash_kills) }
      ] : [{
        key: "utility", label: "Damage · thrown", value: utilityDamage,
        format: item => `${integer(utilityDamage(item))} dmg · ${integer(utilityThrown(item))} thrown`
      }];
      const multikillColumns = state.expandedGroups.multikills ? [5, 4, 3, 2, 1].map(kills => ({
        key: `multikill-${kills}`, label: `${kills}K`, value: item => number(item.stats[`kill_rounds_${kills}k`]), format: item => integer(item.stats[`kill_rounds_${kills}k`])
      })) : [{
        key: "multikills", label: "Total", value: item => [1, 2, 3, 4, 5].reduce((total, kills) => total + number(item.stats[`kill_rounds_${kills}k`]), 0),
        format: item => integer([1, 2, 3, 4, 5].reduce((total, kills) => total + number(item.stats[`kill_rounds_${kills}k`]), 0))
      }];
      const objectiveColumns = state.expandedGroups.objectives ? [
        { key: "objective-plants", label: "Plants", value: item => number(item.stats.bomb_plants), format: item => integer(item.stats.bomb_plants) },
        { key: "objective-defuses", label: "Defuses", value: item => number(item.stats.bomb_defuses), format: item => integer(item.stats.bomb_defuses) }
      ] : [{
        key: "objectives", label: "Plants/defuses", value: item => number(item.stats.bomb_plants),
        format: item => `${integer(item.stats.bomb_plants)}/${integer(item.stats.bomb_defuses)}`
      }];
      const timed = item => number(item.stats.timed_rounds) > 0;
      const averageTime = (item, kind) => {
        const samples = number(item.stats[`${kind}_time_samples`]);
        return samples ? number(item.stats[`${kind}_time_total_ms`]) / samples / 1000 : Number.NaN;
      };
      const timingPair = (item, phase) => timed(item) ? `${integer(item.stats[`${phase}_kills`])}-${integer(item.stats[`${phase}_deaths`])}` : "—";
      const timingColumns = state.expandedGroups.timing ? [
        { key: "timing-kill", label: "Avg kill", value: item => averageTime(item, "kill"), format: item => timed(item) ? seconds(averageTime(item, "kill")) : "—" },
        { key: "timing-death", label: "Avg death", value: item => averageTime(item, "death"), format: item => timed(item) ? seconds(averageTime(item, "death")) : "—" },
        ...["early", "mid", "late", "postplant"].map(phase => ({
          key: `timing-${phase}`, label: `${phase === "postplant" ? "Post-plant" : titleCase(phase)} K-D`,
          value: item => number(item.stats[`${phase}_kills`]) - number(item.stats[`${phase}_deaths`]), format: item => timingPair(item, phase)
        }))
      ] : [{
        key: "timing", label: "Avg K/D time", value: item => averageTime(item, "kill"),
        format: item => timed(item) ? `${seconds(averageTime(item, "kill"))}/${seconds(averageTime(item, "death"))}` : "Not parsed"
      }];
      const segments = [
        { columns: fixedColumns },
        { group: "combat", label: "Overview", columns: focusedColumns("combat", combatColumns) },
        { group: "opening", label: "Opening", columns: focusedColumns("opening", openingColumns) },
        { group: "trades", label: "Trades", columns: focusedColumns("trades", tradesColumns) },
        { group: "clutches", label: "Clutches", columns: focusedColumns("clutches", clutchColumns) },
        { group: "multikills", label: "Kill rounds", columns: focusedColumns("multikills", multikillColumns) },
        { group: "objectives", label: "Objectives", columns: focusedColumns("objectives", objectiveColumns) },
        { group: "roundState", label: "Man count", columns: focusedColumns("roundState", roundStateColumns) },
        { group: "killStage", label: "Kill stage", columns: focusedColumns("killStage", stageColumns) },
        { group: "timing", label: "Round timing", columns: focusedColumns("timing", timingColumns) },
        { group: "killContext", label: "Context", columns: focusedColumns("killContext", contextColumns) },
        { group: "movement", label: "Movement", columns: focusedColumns("movement", movementColumns) },
        { group: "utility", label: "Utility", columns: focusedColumns("utility", utilityColumns) }
      ].filter(segment => !segment.group || groupVisible(segment.group));
      const columns = segments.flatMap(segment => segment.columns.map((column, index) => ({
        ...column, group: segment.group, groupStart: Boolean(segment.group) && index === 0,
        groupEnd: Boolean(segment.group) && index === segment.columns.length - 1
      })));
      const sort = state.sort;
      const ordered = comparison.map((item, index) => ({ item, index }));
      if (sort) {
        const column = columns.find(candidate => candidate.key === sort.key);
        if (column) ordered.sort((left, right) => {
          const a = column.value(left.item), b = column.value(right.item);
          const result = typeof a === "number" && typeof b === "number"
            ? a - b : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
          return (sort.direction === "asc" ? result : -result) || left.index - right.index;
        });
      }

      const sortHeader = (cell, column) => {
        const active = sort?.key === column.key;
        const button = element("button", displayedLabel(column), `player-table-sort-button${active ? " active" : ""}`);
        button.type = "button";
        if (active) button.dataset.direction = sort.direction;
        button.addEventListener("click", () => {
          state.sort = { key: column.key, direction: active ? (sort.direction === "asc" ? "desc" : "asc") : column.key === "player" ? "asc" : "desc", group: column.group || null };
          render(state.input);
        });
        cell.setAttribute("aria-sort", active ? (sort.direction === "asc" ? "ascending" : "descending") : "none");
        cell.appendChild(button);
      };
      const head = document.createElement("thead"), top = document.createElement("tr"), detail = document.createElement("tr");
      for (const segment of segments) {
        if (!segment.group) {
          for (const column of segment.columns) {
            const cell = document.createElement("th"); cell.rowSpan = 2; cell.scope = "col"; sortHeader(cell, column); top.appendChild(cell);
          }
          continue;
        }
        const heading = document.createElement("th");
        heading.colSpan = segment.columns.length;
        heading.className = `demo-toggle-heading ${segment.group}-heading demo-group-start demo-group-end`;
        const toggle = element("button", `${segment.label} ${state.expandedGroups[segment.group] ? "▾" : "▸"}`, "demo-column-toggle");
        toggle.type = "button"; toggle.setAttribute("aria-expanded", String(state.expandedGroups[segment.group]));
        toggle.addEventListener("click", () => {
          const next = !state.expandedGroups[segment.group];
          const sortedGroup = state.sort?.group;
          const sortedColumnDisappears = sortedGroup === segment.group || (next && sortedGroup && state.expandedGroups[sortedGroup]);
          if (sortedColumnDisappears) state.sort = null;
          Object.keys(state.expandedGroups).forEach(group => { state.expandedGroups[group] = false; });
          state.expandedGroups[segment.group] = next; render(state.input);
        });
        const actions = element("div", null, "demo-column-heading-actions");
        actions.appendChild(toggle);
        const subgroup = state.expandedGroups[segment.group] && activeSubgroup(segment.group);
        if (subgroup) {
          const subgroups = sectionSubgroups[segment.group];
          const subgroupIndex = subgroups.findIndex(([key]) => key === subgroup[0]);
          const next = subgroups[(subgroupIndex + 1) % subgroups.length];
          const cycle = element("button", `${subgroup[1]} ↻`, "demo-subgroup-cycle");
          cycle.type = "button";
          cycle.title = `Showing ${subgroup[1]}; switch to ${next[1]}`;
          cycle.setAttribute("aria-label", `${segment.label} detail: ${subgroup[1]}. Switch to ${next[1]}`);
          cycle.addEventListener("click", () => cycleSubgroup(segment.group));
          actions.appendChild(cycle);
        }
        heading.appendChild(actions); top.appendChild(heading);
        segment.columns.forEach((column, index) => {
          const cell = document.createElement("th"); cell.scope = "col"; cell.className = `demo-group-detail ${segment.group}-cell`;
          if (index === 0) cell.classList.add("demo-group-start");
          if (index === segment.columns.length - 1) cell.classList.add("demo-group-end");
          sortHeader(cell, column); detail.appendChild(cell);
        });
      }
      head.append(top, detail);
      const body = document.createElement("tbody");
      for (const { item } of ordered) {
        const row = document.createElement("tr");
        columns.forEach((column, index) => {
          const cell = document.createElement(index === 0 ? "th" : "td");
          if (index === 0) cell.scope = "row";
          cell.textContent = displayedValue(column, item);
          const className = typeof column.className === "function" ? column.className(item) : column.className;
          if (className) cell.className = className;
          if (column.group) cell.classList.add("demo-group-cell", `${column.group}-cell`);
          if (column.groupStart) cell.classList.add("demo-group-start");
          if (column.groupEnd) cell.classList.add("demo-group-end");
          row.appendChild(cell);
        });
        body.appendChild(row);
      }
      const table = byId("Table");
      table.className = `player-profile-table quick-comparison-table${columnGroups.map(([group]) => groupVisible(group) && state.expandedGroups[group] ? ` ${group}-expanded` : "").join("")}`;
      const widths = columns.map((column, index) => estimatedColumnWidth(
        displayedLabel(column), comparison.map(item => displayedValue(column, item)), index === 0
      ));
      const colgroup = document.createElement("colgroup");
      widths.forEach(width => {
        const col = document.createElement("col");
        col.style.width = `${width}px`;
        colgroup.appendChild(col);
      });
      table.style.minWidth = `${widths.reduce((total, width) => total + width, 0)}px`;
      table.replaceChildren(colgroup, head, body);
    }

    function renderSections() {
      const target = byId("Sections");
      if (!target) return;
      const bar = element("div", null, "scoreboard-section-bar scoreboard-control-row");
      bar.appendChild(element("strong", "Sections"));
      const sectionButtons = element("div", null, "scoreboard-button-group scoreboard-section-buttons");
      const preset = (label, values) => {
        const button = element("button", label, "scoreboard-preset-button"); button.type = "button";
        button.addEventListener("click", () => setSharedSections(new Set(values))); sectionButtons.appendChild(button);
      };
      preset("Default", defaultSections); preset("All", sectionOptions.map(([key]) => key));
      sectionOptions.forEach(([key, label, , style]) => {
        const button = element("button", label, `scoreboard-section-button ${style}-heading${state.visibleSections.has(key) ? " active" : ""}`); button.type = "button";
        button.setAttribute("aria-pressed", String(state.visibleSections.has(key)));
        button.addEventListener("click", () => { const selected = new Set(state.visibleSections); if (selected.has(key)) selected.delete(key); else selected.add(key); setSharedSections(selected); });
        sectionButtons.appendChild(button);
      });
      bar.appendChild(sectionButtons);
      const mode = element("div", null, "scoreboard-value-toggle scoreboard-control-row"); mode.appendChild(element("strong", "Values"));
      const modeButtons = element("div", null, "scoreboard-button-group");
      [["totals", "Totals"], ["round", "Per round"], ["match", "Per match"]].forEach(([value, label]) => {
        const button = element("button", label, state.valueMode === value ? "active" : ""); button.type = "button"; button.setAttribute("aria-pressed", String(state.valueMode === value));
        button.addEventListener("click", () => { state.valueMode = value; state.sort = null; render(state.input); }); modeButtons.appendChild(button);
      });
      mode.appendChild(modeButtons);
      const utilityBasis = element("div", null, "scoreboard-utility-basis");
      utilityBasis.appendChild(element("span", "Utility yields"));
      const utilityButton = element("button", "Per grenade", state.perGrenadeUtility ? "active" : ""); utilityButton.type = "button";
      utilityButton.disabled = state.valueMode === "totals"; utilityButton.setAttribute("aria-pressed", String(state.perGrenadeUtility));
      utilityButton.title = "Use each relevant grenade type for damage, flash effects, and flash-assist yields";
      utilityButton.addEventListener("click", () => { state.perGrenadeUtility = !state.perGrenadeUtility; state.sort = null; render(state.input); });
      utilityBasis.appendChild(utilityButton); mode.appendChild(utilityBasis);
      const modeNote = state.valueMode === "totals"
        ? "Raw counts"
        : `${state.valueMode === "match" ? "Counts divided by qualifying matches" : "Counts divided by qualifying rounds"}${state.perGrenadeUtility ? "; utility yield columns use the relevant grenade" : ""}`;
      mode.appendChild(element("small", modeNote, "scoreboard-control-note"));
      target.replaceChildren(bar, mode);
    }

    function render(input) {
      state.input = input;
      renderSections();
      const players = input?.players || [];
      const maps = mapsFor(players);
      if (state.map !== "ALL" && !maps.includes(state.map)) state.map = "ALL";
      const tabs = byId("Maps");
      tabs.replaceChildren();
      [["ALL", "All maps"], ...maps.map(map => [map, titleCase(map.replace(/^de_/, ""))])].forEach(([value, label]) => {
        const active = state.map === value;
        const button = element("button", label, `match-browser-tab${active ? " active" : ""}`);
        button.type = "button"; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
        button.addEventListener("click", () => { state.map = value; render(state.input); });
        tabs.appendChild(button);
      });
      const comparison = players.map(player => {
        const rows = (player.rows || []).filter(row => state.map === "ALL" || row.map === state.map);
        return { player, rows, stats: input.summarize(rows) };
      });
      const counts = comparison.map(item => item.rows.length);
      const minimum = counts.length ? Math.min(...counts) : 0, maximum = counts.length ? Math.max(...counts) : 0;
      const matchLabel = minimum === maximum
        ? `${integer(maximum)} qualifying match${maximum === 1 ? "" : "es"}`
        : `${integer(minimum)}–${integer(maximum)} qualifying matches per player`;
      const mapLabel = state.map === "ALL" ? "All maps" : titleCase(state.map.replace(/^de_/, ""));
      byId("Meta").textContent = [mapLabel, matchLabel, input.metaSuffix].filter(Boolean).join(" · ");
      renderTable(comparison);
      byId("Empty").hidden = maximum > 0;
    }

    function reset() {
      state.map = "ALL";
      state.expandedGroups = Object.fromEntries(columnGroups.map(([key]) => [key, false]));
      state.sectionSubgroups = {};
      state.valueMode = "totals";
      state.perGrenadeUtility = false;
      state.sort = null;
      state.input = null;
    }

    const syncSections = sections => {
      state.visibleSections = new Set(sections);
      Object.keys(state.expandedGroups).forEach(group => { if (!groupVisible(group)) state.expandedGroups[group] = false; });
      if (state.sort?.group && !groupVisible(state.sort.group)) state.sort = null;
      if (state.input) render(state.input); else renderSections();
    };
    sectionSubscribers.add(syncSections);
    renderSections();

    return { render, reset };
  }

  window.NickStatsQuickComparison = { create };
})();
