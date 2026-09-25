(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const colors = ["#455f97", "#d18c00", "#168a77", "#9d51ba", "#bd343e"];
  const MIN_BUCKETS = 4;
  const MAX_BUCKETS = 24;
  const DEFAULT_BUCKETS = 10;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const availability = window.NickStatsAvailability;
  const ratio = (a, b) => number(b) > 0 ? number(a) / number(b) : number(a);
  const availableStats = (stats, key) => availability.scope(stats, key);
  const rate = key => stats => {
    const scoped = availableStats(stats, key);
    return scoped ? ratio(scoped[key], scoped.rounds) : Number.NaN;
  };
  const timingRate = key => stats => number(stats.timed_rounds) > 0 ? ratio(stats[key], stats.timed_rounds) : Number.NaN;
  const timedAverage = (total, samples) => stats => number(stats[samples]) > 0 ? ratio(stats[total], stats[samples]) / 1000 : Number.NaN;
  const count = key => stats => {
    const scoped = availableStats(stats, key);
    return scoped ? number(scoped[key]) : Number.NaN;
  };
  const percentage = (a, b) => stats => {
    const scoped = availableStats(stats, a);
    return scoped ? 100 * ratio(scoped[a], scoped[b]) : Number.NaN;
  };
  const economyPercentage = key => stats => number(stats[`economy_${key}_rounds`]) > 0
    ? 100 * ratio(stats[`economy_${key}_wins`], stats[`economy_${key}_rounds`]) : Number.NaN;
  const economyAverageValue = key => stats => number(stats[`economy_${key}_rounds`]) > 0
    ? ratio(stats[`economy_${key}_equipment_value`], stats[`economy_${key}_rounds`]) : Number.NaN;

  function rating(stats) {
    const rounds = number(stats.rounds);
    if (!rounds) return 0;
    const kpr = ratio(stats.kills, rounds), dpr = ratio(stats.deaths, rounds), apr = ratio(stats.assists, rounds);
    const adr = ratio(stats.damage, rounds), kast = 100 * ratio(stats.kast_rounds, rounds);
    const impact = 2.13 * kpr + .42 * apr - .41;
    return Math.max(0, .0073 * kast + .3591 * kpr - .5329 * dpr + .2372 * impact + .0032 * adr + .1587);
  }

  const metrics = [
    ["Core", [
      ["rating", "Rating", rating, 2], ["kd", "K/D", stats => ratio(stats.kills, stats.deaths), 2],
      ["adr", "ADR", rate("damage"), 1], ["kast", "KAST", percentage("kast_rounds", "rounds"), 1, "%"],
      ["kills", "Kills", count("kills"), 0], ["deaths", "Deaths", count("deaths"), 0], ["damage", "Damage", count("damage"), 0],
      ["round_diff", "Round differential", () => Number.NaN, 2],
      ["awp_kills", "AWP kills", count("awp_kills"), 0], ["assists", "Assists", count("assists"), 0],
      ["kpr", "Kills per round", rate("kills"), 2], ["dpr", "Deaths per round", rate("deaths"), 2], ["apr", "Assists per round", rate("assists"), 2],
      ["hs", "Headshot rate", percentage("headshots", "kills"), 1, "%"], ["damage_diff", "Damage differential per round", stats => ratio(number(stats.damage) - number(stats.damage_received), stats.rounds), 1]
    ]],
    ["Opening", [
      ["opening_kpr", "Opening kills per round", rate("opening_kills"), 3], ["opening_dpr", "Opening deaths per round", rate("opening_deaths"), 3],
      ["opening_attempt_rate", "Opening attempt rate", stats => 100 * ratio(number(stats.opening_kills) + number(stats.opening_deaths), stats.rounds), 1, "%"],
      ["opening_diff", "Opening differential", stats => number(stats.opening_kills) - number(stats.opening_deaths), 0],
      ["opening_success", "Opening success", stats => 100 * ratio(stats.opening_kills, number(stats.opening_kills) + number(stats.opening_deaths)), 1, "%"],
      ["opening_assisted_kpr", "Assisted opening kills per round", rate("opening_assisted_kills"), 3],
      ["opening_damage_assisted_kpr", "Damage-assisted openings per round", rate("opening_damage_assisted_kills"), 3],
      ["opening_flash_assisted_kpr", "Flash-assisted openings per round", rate("opening_flash_assisted_kills"), 3],
      ["opening_traded_death_rate", "Opening deaths traded", percentage("opening_traded_deaths", "opening_deaths"), 1, "%"],
      ["opening_trade_kpr", "Opening trade kills per round", rate("opening_trade_kills"), 3],
      ["opening_assists_pr", "Opening assists per round", rate("opening_assists"), 3],
      ["opening_damage_assists_pr", "Damage opening assists per round", rate("opening_damage_assists"), 3],
      ["opening_flash_assists_pr", "Flash opening assists per round", rate("opening_flash_assists"), 3],
      ["opening_blinded_enemy_kpr", "Opening kills on blinded enemies per round", rate("opening_blinded_enemy_kills"), 3],
      ["opening_blind_kpr", "Opening kills while blind per round", rate("opening_blind_kills"), 3],
      ["opening_blind_dpr", "Opening deaths while blind per round", rate("opening_deaths_while_blind"), 3],
      ["opening_blind_killer_dpr", "Opening deaths to blind killers per round", rate("opening_deaths_to_blind_killer"), 3],
      ["opening_enemy_assisted_dpr", "Enemy-assisted opening deaths per round", rate("opening_enemy_assisted_deaths"), 3],
      ["opening_enemy_damage_assisted_dpr", "Enemy damage-assisted opening deaths per round", rate("opening_enemy_damage_assisted_deaths"), 3],
      ["opening_enemy_flash_assisted_dpr", "Enemy flash-assisted opening deaths per round", rate("opening_enemy_flash_assisted_deaths"), 3],
      ["opening_own_flash_kpr", "Own-flashed opening kills per round", rate("opening_own_flash_kills"), 3],
      ["opening_victim_side_flash_kpr", "Victim-side-flashed opening kills per round", rate("opening_victim_side_flash_kills"), 3],
      ["opening_unknown_flash_kpr", "Opening kills with unknown blind source per round", rate("opening_blind_source_unknown_kills"), 3],
      ["opening_killer_flash_dpr", "Opening deaths to killer's flash per round", rate("opening_deaths_to_killer_flash"), 3],
      ["opening_own_side_flash_dpr", "Opening deaths while own-side flashed per round", rate("opening_deaths_to_own_side_flash"), 3],
      ["opening_unknown_flash_dpr", "Opening deaths with unknown blind source per round", rate("opening_deaths_blind_source_unknown"), 3],
      ["opening_assist_rate", "Opening kills assisted", percentage("opening_assisted_kills", "opening_kills"), 1, "%"]
    ]],
    ["Trades", [
      ["trade_kpr", "Trade kills per round", rate("trade_kills"), 3], ["trade_response", "Trade response rate", percentage("trade_attempts", "trade_opportunities"), 1, "%"],
      ["trade_success", "Trade success rate", percentage("trade_successes", "trade_attempts"), 1, "%"], ["traded_death_rate", "Tradeable deaths converted", percentage("traded_deaths", "tradeable_deaths"), 1, "%"]
    ]],
    ["Utility", [
      ["utility_dr", "Utility damage per round", stats => ratio(number(stats.he_damage) + number(stats.fire_damage), stats.rounds), 1],
      ["he_dr", "HE damage per round", rate("he_damage"), 1], ["fire_dr", "Fire damage per round", rate("fire_damage"), 1],
      ["enemies_flashed_r", "Enemies flashed per round", rate("enemies_flashed"), 2],
      ["enemy_blind_seconds_r", "Enemy blind seconds per round", stats => ratio(number(stats.blind_duration_ms) / 1000, stats.rounds), 2],
      ["teammates_flashed_r", "Teammates flashed per round", rate("teammates_flashed"), 2],
      ["teammate_blind_seconds_r", "Teammate blind seconds per round", stats => ratio(number(stats.teammate_blind_duration_ms) / 1000, stats.rounds), 2],
      ["self_flashes_r", "Self flash effects per round", rate("self_flashes"), 2],
      ["self_blind_seconds_r", "Self blind seconds per round", stats => ratio(number(stats.self_blind_duration_ms) / 1000, stats.rounds), 2],
      ["flash_assists_r", "Flash assists per round", rate("flash_assists"), 3],
      ["he_thrown_r", "HE grenades per round", rate("he_grenades_thrown"), 3], ["flashes_thrown_r", "Flashbangs per round", rate("flashbangs_thrown"), 3],
      ["smokes_thrown_r", "Smokes per round", rate("smokes_thrown"), 3], ["fire_thrown_r", "Fire grenades per round", rate("fire_grenades_thrown"), 3]
    ]],
    ["Rounds and context", [
      ["round_win", "Round win rate", percentage("round_wins", "rounds"), 1, "%"], ["clutches", "Clutches won", stats => [1, 2, 3, 4, 5].reduce((sum, n) => sum + number(stats[`clutch_1v${n}`]), 0), 0],
      ["multikill_rate", "Multi-kill round rate", stats => 100 * ratio([2, 3, 4, 5].reduce((sum, n) => sum + number(stats[`kill_rounds_${n}k`]), 0), stats.rounds), 1, "%"],
      ["true_multikill_rate", "True multi-kill round rate", stats => {
        const scoped = availableStats(stats, "trueMultikillPercent");
        return scoped ? 100 * ratio(scoped.true_multikill_rounds, scoped.rounds) : Number.NaN;
      }, 1, "%"],
      ["team_win_survivors", "Team survivors in won rounds", stats => number(stats.team_win_survivor_rounds) > 0 ? ratio(stats.team_win_survivor_total, stats.team_win_survivor_rounds) : Number.NaN, 2],
      ["opponent_win_survivors", "Opponent survivors in lost rounds", stats => number(stats.opponent_win_survivor_rounds) > 0 ? ratio(stats.opponent_win_survivor_total, stats.opponent_win_survivor_rounds) : Number.NaN, 2],
      ["clutch_success", "Clutch success", stats => {
        const wins = [1, 2, 3, 4, 5].reduce((sum, n) => sum + number(stats[`clutch_1v${n}`]), 0);
        const attempts = [1, 2, 3, 4, 5].reduce((sum, n) => sum + number(stats[`clutch_attempt_1v${n}`]), 0);
        return 100 * ratio(wins, attempts);
      }, 1, "%"],
      ["bullshit_kr", "Bullshit kills per round", rate("unfair_kills"), 3], ["bullshit_dr", "Bullshit deaths per round", rate("unfair_deaths"), 3],
      ["clawback_kr", "Clawback kills per round", rate("clawback_kills"), 3], ["bozo_dr", "Bozo deaths per round", rate("bozo_deaths"), 3],
      ["even_kr", "Even-state kills per round", rate("even_kills"), 3], ["even_dr", "Even-state deaths per round", rate("even_deaths"), 3],
      ["advantage_kr", "Advantage kills per round", rate("advantage_kills"), 3], ["outnumbered_dr", "Outnumbered deaths per round", rate("disadvantage_deaths"), 3],
      ["cleanup_kr", "Cleanup kills per round", rate("cleanup_kills"), 3], ["cleanup_dr", "Cleanup deaths per round", rate("cleanup_deaths"), 3],
      ["wallbang_kr", "Wallbang kills per round", rate("wallbang_kills"), 3], ["smoke_kr", "Smoke kills per round", rate("smoke_kills"), 3],
      ["paul_kr", "Paul kills per round", rate("equipment_disadvantage_kills"), 3], ["paul_dr", "Paul deaths per round", rate("equipment_disadvantage_deaths"), 3]
    ]],
    ["Kill stage", [5, 4, 3, 2, 1].flatMap(alive => [
      [`enemy_${alive}_kr`, `Kills vs ${alive} alive per round`, rate(`enemy_alive_${alive}_kills`), 3],
      [`enemy_${alive}_dr`, `Deaths vs ${alive} alive per round`, rate(`enemy_alive_${alive}_deaths`), 3]
    ])],
    ["Economy", [
      ["pistol_win", "Pistol-round win rate", economyPercentage("pistol"), 1, "%"],
      ["eco_win", "Eco round win rate", economyPercentage("eco"), 1, "%"],
      ["force_win", "Force-buy round win rate", economyPercentage("force"), 1, "%"],
      ["full_win", "Full-buy round win rate", economyPercentage("full"), 1, "%"],
      ["eco_value", "Average eco team value", economyAverageValue("eco"), 0],
      ["force_value", "Average force-buy team value", economyAverageValue("force"), 0],
      ["full_value", "Average full-buy team value", economyAverageValue("full"), 0]
    ]],
    ["Round timing", [
      ["kill_time", "Average kill time", timedAverage("kill_time_total_ms", "kill_time_samples"), 1, "s"],
      ["death_time", "Average death time", timedAverage("death_time_total_ms", "death_time_samples"), 1, "s"],
      ["early_kr", "Early kills per timed round", timingRate("early_kills"), 3], ["early_dr", "Early deaths per timed round", timingRate("early_deaths"), 3],
      ["mid_kr", "Mid-round kills per timed round", timingRate("mid_kills"), 3], ["mid_dr", "Mid-round deaths per timed round", timingRate("mid_deaths"), 3],
      ["late_kr", "Late kills per timed round", timingRate("late_kills"), 3], ["late_dr", "Late deaths per timed round", timingRate("late_deaths"), 3],
      ["postplant_kr", "Post-plant kills per timed round", timingRate("postplant_kills"), 3], ["postplant_dr", "Post-plant deaths per timed round", timingRate("postplant_deaths"), 3]
    ]]
  ];

  const registry = new Map(metrics.flatMap(([group, entries]) => entries.map(([id, label, value, digits, suffix = ""]) => [id, { id, group, label, value, digits, suffix }])));
  const roundMetrics = Object.freeze({ kills: "kills", kpr: "kills", deaths: "deaths", dpr: "deaths", damage: "damage", adr: "damage", awp_kills: "awp_kills", round_diff: "differential" });
  const roundLabel = metric => ({ adr: "damage", kpr: "kills", dpr: "deaths" })[metric.id] || metric.label.toLowerCase();
  const graphState = new Map();

  function mergeStats(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
      target[key] = key.endsWith("_max") ? Math.max(number(target[key]), number(value)) : number(target[key]) + number(value);
    }
  }

  function statsForMatch(match, side = "ALL", buy = "ALL", roundResult = "ALL", opponentBuy = "ALL", roundPhase = "ALL", heroOnly = false) {
    const stats = {}, sides = match.sides || match.sideRows || [];
    const selected = sides.filter(row => {
      const rowOpponentBuy = row.opponent_buy_type || "ALL";
      const economyMatches = opponentBuy !== "ALL"
        ? rowOpponentBuy === opponentBuy && (buy === "ALL" || (buy === "hero" ? ["eco", "force"].includes(row.buy_type) : row.buy_type === buy)) &&
          (roundResult === "ALL" || row.round_result === roundResult)
        : rowOpponentBuy === "ALL" &&
          (buy === "ALL" || buy === "hero" ? (row.buy_type || "ALL") === "ALL" : row.buy_type === buy) &&
          (roundResult === "ALL" ? (row.round_result || "ALL") === "ALL" : row.round_result === roundResult);
      return economyMatches && Boolean(row.hero) === heroOnly && (row.round_phase || "ALL") === roundPhase && (side === "ALL" || row.side === side);
    });
    selected.forEach(row => {
      mergeStats(stats, row.stats);
      stats.awp_kills = number(stats.awp_kills) + (row.weapons || []).filter(weapon => String(weapon.weapon).toLowerCase() === "awp").reduce((sum, weapon) => sum + number(weapon.kills), 0);
    });
    if (!selected.length && !heroOnly && roundPhase === "ALL" && side === "ALL" && buy === "ALL" && opponentBuy === "ALL" && roundResult === "ALL") mergeStats(stats, match.legacy || match);
    stats.__schema = match.schema;
    return stats;
  }

  function samplesForMatches(matches, side = "ALL", buy = "ALL", roundResult = "ALL", opponentBuy = "ALL", roundPhase = "ALL", heroOnly = false) {
    return (matches || []).map((match, index) => ({
      id: String(match.id ?? index),
      date: number(match.played_at ?? match.date),
      result: match.result,
      map: match.map,
      stats: statsForMatch(match, side, buy, roundResult, opponentBuy, roundPhase, heroOnly)
    })).filter(sample => number(sample.stats.rounds) > 0);
  }

  const svgElement = (tag, attributes = {}, text = null) => {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text != null) element.textContent = text;
    return element;
  };

  function attachTooltip(svg, element, label, anchorX, anchorY) {
    const hide = () => svg.querySelector(".graph-tooltip")?.remove();
    const show = () => {
      hide();
      const width = Math.min(360, Math.max(150, label.length * 6.2 + 16));
      const x = Math.max(5, Math.min(895 - width, anchorX - width / 2));
      const y = anchorY > 54 ? anchorY - 36 : anchorY + 10;
      const tooltip = svgElement("g", { class: "graph-tooltip", role: "tooltip" });
      tooltip.appendChild(svgElement("rect", { x, y, width, height: 28, rx: 6 }));
      tooltip.appendChild(svgElement("text", { x: x + 8, y: y + 18 }, label));
      svg.appendChild(tooltip);
    };
    element.setAttribute("aria-label", label);
    element.addEventListener("pointerenter", show);
    element.addEventListener("pointerleave", hide);
  }
  const format = (value, metric) => `${number(value).toFixed(metric.digits)}${metric.suffix}`;
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const median = values => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const deviation = values => {
    if (values.length < 2) return 0;
    const average = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
  };

  function valuesFor(series, metric) {
    return series.samples.map(sample => ({ ...sample, value: metric.value(sample.stats) })).filter(sample => Number.isFinite(sample.value));
  }

  function independentTrendNeedsDates(series) {
    return series.length > 1 && series.some(item => item.values.some(point => point.date <= 0));
  }

  function distributionBounds(series) {
    const values = series.flatMap(item => item.values.map(point => point.value));
    if (!values.length) return null;
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { const padding = Math.abs(min) * .1 || 1; min -= padding; max += padding; }
    return { min, max };
  }

  function niceDistributionBounds(series, metric, bins) {
    const bounds = distributionBounds(series);
    if (!bounds) return null;
    const displayUnit = 10 ** -metric.digits;
    const exactWidth = (bounds.max - bounds.min) / bins;
    const binWidth = Math.max(displayUnit, Math.ceil(exactWidth / displayUnit - 1e-9) * displayUnit);
    const min = Math.floor(bounds.min / binWidth + 1e-9) * binWidth;
    return { min, max: min + binWidth * bins, binWidth };
  }

  function setLine(svg, x1, y1, x2, y2, className = "graph-axis") {
    svg.appendChild(svgElement("line", { x1, y1, x2, y2, class: className }));
  }

  function drawAxes(svg, { left, top, width, height, min, max, metric, yMax = null }) {
    setLine(svg, left, top, left, top + height); setLine(svg, left, top + height, left + width, top + height);
    for (let tick = 0; tick <= 4; tick += 1) {
      const y = top + height - height * tick / 4;
      setLine(svg, left, y, left + width, y, "graph-grid-line");
      const value = yMax == null ? min + (max - min) * tick / 4 : yMax * tick / 4;
      svg.appendChild(svgElement("text", { x: left - 9, y: y + 4, class: "graph-axis-label", "text-anchor": "end" }, yMax == null ? format(value, metric) : `${value.toFixed(0)}%`));
    }
  }

  function drawDistribution(svg, prepared, domainSeries, metric, bins, displayStyle) {
    const bounds = niceDistributionBounds(domainSeries.length ? domainSeries : prepared, metric, bins);
    if (!bounds) return;
    const { min, max, binWidth } = bounds;
    const left = 68, top = 24, width = 796, height = 318;
    const formatBoundary = value => `${number(value).toFixed(metric.digits)}${metric.suffix}`;
    const histogram = series => {
      const counts = Array(bins).fill(0);
      series.values.forEach(point => counts[Math.min(bins - 1, Math.floor((point.value - min) / binWidth))] += 1);
      return { ...series, percentages: counts.map(value => 100 * value / Math.max(1, series.values.length)) };
    };
    const histograms = prepared.map(histogram), domainHistograms = (domainSeries.length ? domainSeries : prepared).map(histogram);
    const yMax = Math.max(1, ...domainHistograms.flatMap(series => series.percentages));
    const groupWidth = width / bins;
    for (let index = 0; index < bins; index += 1) {
      const x = left + index * groupWidth;
      svg.appendChild(svgElement("rect", { x, y: top, width: groupWidth, height, class: `graph-bucket-band${index % 2 ? " graph-bucket-band-alt" : ""}` }));
      setLine(svg, x, top, x, top + height, "graph-bucket-divider");
    }
    setLine(svg, left + width, top, left + width, top + height, "graph-bucket-divider");
    drawAxes(svg, { left, top, width, height, min, max, metric, yMax });
    for (let index = 0; index <= bins; index += 1) {
      const x = left + groupWidth * index, y = top + height + 20;
      const label = formatBoundary(min + index * binWidth);
      const attributes = { x, y, class: "graph-bucket-label", "text-anchor": "middle" };
      if (bins > 10) attributes.transform = `rotate(${bins > 17 ? -55 : -35} ${x} ${y})`;
      svg.appendChild(svgElement("text", attributes, label));
    }
    const pointTitle = (series, value, index) => {
      const lower = formatBoundary(min + index * binWidth), upper = formatBoundary(min + (index + 1) * binWidth);
      return `${series.label}: ${value.toFixed(1)}% of matches · ${lower} ≤ value ${index === bins - 1 ? "≤" : "<"} ${upper}`;
    };
    if (displayStyle === "line") {
      histograms.forEach((series, seriesIndex) => {
        const colorIndex = series.colorIndex ?? seriesIndex;
        const points = series.percentages.map((value, index) => {
          const x = left + width * (index + .5) / bins, y = top + height - height * value / yMax;
          return `${x},${y}`;
        }).join(" ");
        const line = svgElement("polyline", { points, class: "graph-series-line", stroke: colors[colorIndex % colors.length] });
        svg.appendChild(line);
        series.percentages.forEach((value, index) => {
          const x = left + width * (index + .5) / bins, y = top + height - height * value / yMax;
          const dot = svgElement("circle", { cx: x, cy: y, r: 4, fill: colors[colorIndex % colors.length], class: "graph-point" });
          svg.appendChild(dot); attachTooltip(svg, dot, pointTitle(series, value, index), x, y);
        });
      });
    } else {
      const innerWidth = groupWidth * .84, barWidth = innerWidth / histograms.length;
      histograms.forEach((series, seriesIndex) => {
        const colorIndex = series.colorIndex ?? seriesIndex;
        series.percentages.forEach((value, index) => {
          const barHeight = height * value / yMax;
          const bar = svgElement("rect", {
            x: left + index * groupWidth + (groupWidth - innerWidth) / 2 + seriesIndex * barWidth,
            y: top + height - barHeight,
            width: Math.max(1, barWidth - 1),
            height: barHeight,
            fill: colors[colorIndex % colors.length],
            class: "graph-series-bar"
          });
          svg.appendChild(bar);
          attachTooltip(svg, bar, pointTitle(series, value, index), number(bar.getAttribute("x")) + number(bar.getAttribute("width")) / 2, number(bar.getAttribute("y")));
        });
      });
    }
    svg.appendChild(svgElement("text", { x: left + width / 2, y: 448, class: "graph-axis-title", "text-anchor": "middle" }, metric.label));
    svg.appendChild(svgElement("text", { x: 17, y: top + height / 2, class: "graph-axis-title", transform: `rotate(-90 17 ${top + height / 2})`, "text-anchor": "middle" }, "Share of matches"));
  }

  function drawTrend(svg, prepared, metric, displayStyle = "line") {
    const allPoints = prepared.flatMap(series => series.values);
    if (!allPoints.length) return;
    let min = Math.min(...allPoints.map(point => point.value)), max = Math.max(...allPoints.map(point => point.value));
    if (min === max) { const padding = Math.abs(min) * .1 || 1; min -= padding; max += padding; }
    if (displayStyle === "bars") { min = Math.min(0, min); max = Math.max(0, max); }
    const ids = new Map();
    allPoints.forEach(point => {
      const existing = ids.get(point.id);
      if (!existing || (point.date > 0 && !existing.dated)) ids.set(point.id, { id: point.id, dated: point.date > 0, date: point.date });
    });
    const matches = [...ids.values()], allDated = matches.every(match => match.dated);
    matches.sort((a, b) => allDated ? a.date - b.date || a.id.localeCompare(b.id, undefined, { numeric: true }) : a.id.localeCompare(b.id, undefined, { numeric: true }));
    const positions = new Map(matches.map((match, index) => [match.id, index]));
    const left = 68, top = 24, width = 796, height = 318;
    drawAxes(svg, { left, top, width, height, min, max, metric });
    const zeroY = top + height - height * (0 - min) / (max - min);
    const barWidth = Math.max(1, Math.min(28, width / Math.max(1, matches.length * prepared.length) * .8));
    prepared.forEach((series, seriesIndex) => {
      const colorIndex = series.colorIndex ?? seriesIndex;
      const ordered = [...series.values].sort((a, b) => positions.get(a.id) - positions.get(b.id));
      const coordinates = ordered.map(point => {
        const x = left + width * positions.get(point.id) / Math.max(1, matches.length - 1);
        const y = top + height - height * (point.value - min) / (max - min);
        return { point, x, y };
      });
      if (displayStyle === "line") svg.appendChild(svgElement("polyline", { points: coordinates.map(({ x, y }) => `${x},${y}`).join(" "), class: "graph-series-line", stroke: colors[colorIndex % colors.length] }));
      coordinates.forEach(({ point, x, y }) => {
        const mark = displayStyle === "bars"
          ? svgElement("rect", { x: x + (seriesIndex - (prepared.length - 1) / 2) * barWidth - barWidth / 2, y: Math.min(y, zeroY), width: barWidth, height: Math.max(2, Math.abs(y - zeroY)), fill: colors[colorIndex % colors.length], class: "graph-series-bar" })
          : svgElement("circle", { cx: x, cy: y, r: 4, fill: colors[colorIndex % colors.length], class: "graph-point" });
        const date = point.date > 0 ? new Date(point.date * 1000).toLocaleDateString() : `Match #${point.id}`;
        svg.appendChild(mark); attachTooltip(svg, mark, `${series.label} · ${date}: ${format(point.value, metric)}`, x, y);
      });
    });
    svg.appendChild(svgElement("text", { x: left + width / 2, y: 396, class: "graph-axis-title", "text-anchor": "middle" }, allDated ? "Match date" : "Match order"));
    svg.appendChild(svgElement("text", { x: 17, y: top + height / 2, class: "graph-axis-title", transform: `rotate(-90 17 ${top + height / 2})`, "text-anchor": "middle" }, metric.label));
  }

  function drawRounds(svg, prepared, metric, displayStyle = "line") {
    const all = prepared.flatMap(series => series.roundValues);
    const lastRound = Math.max(...all.map(point => point.round));
    const minValue = Math.min(0, ...all.map(point => point.value)), maxValue = Math.max(0, ...all.map(point => point.value));
    const range = minValue === maxValue ? 1 : maxValue - minValue;
    const left = 68, top = 24, width = 796, height = 318;
    const averageMetric = { ...metric, digits: metric.id === "damage" || metric.id === "adr" ? 1 : 2 };
    drawAxes(svg, { left, top, width, height, min: minValue, max: minValue + range, metric: averageMetric });
    const xFor = round => left + width * (round - 1) / Math.max(1, lastRound - 1);
    const yFor = value => top + height - height * (value - minValue) / range;
    const zeroY = yFor(0);
    if (metric.id === "round_diff") setLine(svg, left, zeroY, left + width, zeroY, "graph-zero-line");
    const barWidth = Math.max(1, Math.min(22, width / Math.max(1, lastRound * prepared.length) * .8));
    const tickStep = lastRound <= 36 ? 1 : Math.ceil(lastRound / 36);
    for (let round = 1; round <= lastRound; round += 1) {
      const x = xFor(round);
      if (round === 13 || round === 25) setLine(svg, x, top, x, top + height, "graph-bucket-divider");
      if (round === 1 || round === lastRound || round % tickStep === 0) {
        svg.appendChild(svgElement("text", { x, y: top + height + 19, class: "graph-bucket-label", "text-anchor": "middle" }, String(round)));
      }
    }
    prepared.forEach((series, index) => {
      const color = colors[(series.colorIndex ?? index) % colors.length];
      let segment = [], previous = null;
      const flush = () => {
        if (segment.length > 1) svg.appendChild(svgElement("polyline", { points: segment.join(" "), class: "graph-series-line", stroke: color }));
        segment = [];
      };
      if (displayStyle === "line") {
        series.roundValues.forEach(point => {
          if (previous !== null && point.round !== previous + 1) flush();
          const x = xFor(point.round), y = yFor(point.value);
          segment.push(`${x},${y}`); previous = point.round;
        });
        flush();
      }
      series.roundValues.forEach(point => {
        const x = xFor(point.round), y = yFor(point.value);
        const mark = displayStyle === "bars"
          ? svgElement("rect", { x: x + (index - (prepared.length - 1) / 2) * barWidth - barWidth / 2, y: Math.min(y, zeroY), width: barWidth, height: Math.max(2, Math.abs(zeroY - y)), fill: color, class: "graph-series-bar" })
          : svgElement("circle", { cx: x, cy: y, r: 4, fill: color, class: "graph-point" });
        svg.appendChild(mark);
        const signed = metric.id === "round_diff" && point.value > 0 ? "+" : "";
        attachTooltip(svg, mark, `${series.label} · Round ${point.round}: ${signed}${format(point.value, averageMetric)} ${roundLabel(metric)} (${point.appearances} played)`, x, y);
      });
    });
    svg.appendChild(svgElement("text", { x: left + width / 2, y: 396, class: "graph-axis-title", "text-anchor": "middle" }, "Round number"));
    svg.appendChild(svgElement("text", { x: 17, y: top + height / 2, class: "graph-axis-title", transform: `rotate(-90 17 ${top + height / 2})`, "text-anchor": "middle" }, `Average ${roundLabel(metric)}`));
  }

  function metricChoices(category, query) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return metrics.filter(([group]) => category === "All" || group === category || words.length).map(([group, entries]) => [group, entries.filter(([, label]) => words.every(word => `${group} ${label}`.toLocaleLowerCase().includes(word)))]).filter(([, entries]) => entries.length);
  }

  function closeSuggestions(prefix) {
    const state = graphState.get(prefix), input = document.getElementById(`${prefix}GraphMetric`);
    const list = document.getElementById(`${prefix}GraphSuggestions`), category = document.getElementById(`${prefix}GraphCategory`);
    if (!state || !input || !list) return;
    input.value = registry.get(state.metricId).label;
    input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
    if (category) { category.value = state.category; window.NickStatsDropdown.sync(category); }
    list.hidden = true; list.replaceChildren(); state.suggestions = []; state.suggestionIndex = -1;
  }

  function selectMetric(prefix, id) {
    const state = graphState.get(prefix), metric = registry.get(id);
    if (!state || !metric) return;
    state.metricId = id;
    const category = document.getElementById(`${prefix}GraphCategory`);
    if (category) state.category = category.value === "All" ? "All" : metric.group;
    closeSuggestions(prefix); draw(prefix);
  }

  function showSuggestions(prefix, query = "") {
    const state = graphState.get(prefix), input = document.getElementById(`${prefix}GraphMetric`);
    const list = document.getElementById(`${prefix}GraphSuggestions`), category = document.getElementById(`${prefix}GraphCategory`);
    if (!state || !input || !list) return;
    const choices = metricChoices(category?.value || "All", query).flatMap(([group, entries]) => entries.map(([id, label]) => ({ id, label, group })));
    state.suggestions = choices.slice(0, 30); state.suggestionIndex = -1;
    list.replaceChildren(); list.hidden = false;
    input.setAttribute("aria-expanded", "true"); input.removeAttribute("aria-activedescendant");
    if (!state.suggestions.length) {
      const empty = document.createElement("p"); empty.textContent = "No matching statistics"; list.appendChild(empty);
    }
    state.suggestions.forEach((choice, index) => {
      const button = document.createElement("button"); button.type = "button"; button.id = `${prefix}GraphSuggestion${index}`;
      button.setAttribute("role", "option"); button.setAttribute("aria-selected", "false");
      const name = document.createElement("span"); name.textContent = choice.label;
      const group = document.createElement("small"); group.textContent = choice.group;
      button.append(name, group);
      let chosenByPointer = false;
      button.addEventListener("pointerdown", event => {
        event.preventDefault(); event.stopPropagation();
        chosenByPointer = true; selectMetric(prefix, choice.id);
      });
      button.addEventListener("click", () => { if (!chosenByPointer) selectMetric(prefix, choice.id); });
      list.appendChild(button);
    });
  }

  function moveSuggestion(prefix, amount) {
    const state = graphState.get(prefix), input = document.getElementById(`${prefix}GraphMetric`);
    if (!state?.suggestions.length) return;
    state.suggestionIndex = state.suggestionIndex < 0
      ? amount > 0 ? 0 : state.suggestions.length - 1
      : (state.suggestionIndex + amount + state.suggestions.length) % state.suggestions.length;
    const list = document.getElementById(`${prefix}GraphSuggestions`);
    [...list.querySelectorAll('[role="option"]')].forEach((button, index) => button.setAttribute("aria-selected", String(index === state.suggestionIndex)));
    const active = document.getElementById(`${prefix}GraphSuggestion${state.suggestionIndex}`);
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  function draw(prefix) {
    const state = graphState.get(prefix); if (!state) return;
    const type = document.getElementById(`${prefix}GraphType`), metricInput = document.getElementById(`${prefix}GraphMetric`);
    const svg = document.getElementById(`${prefix}GraphSvg`), summary = document.getElementById(`${prefix}GraphSummary`);
    const legend = document.getElementById(`${prefix}GraphLegend`), note = document.getElementById(`${prefix}GraphNote`);
    const distributionStyleControl = document.getElementById(`${prefix}GraphDistributionStyleControl`);
    const distributionStyle = document.getElementById(`${prefix}GraphDistributionStyle`);
    const bucketControl = document.getElementById(`${prefix}GraphBucketControl`), bucketCount = document.getElementById(`${prefix}GraphBucketCount`);
    const bucketLess = document.getElementById(`${prefix}GraphBucketsLess`), bucketMore = document.getElementById(`${prefix}GraphBucketsMore`);
    if (!type || !metricInput || !svg || !summary || !legend || !note) return;
    const scope = document.getElementById(`${prefix}GraphScope`);
    const roundOnly = state.metricId === "round_diff";
    const supportsRounds = Object.hasOwn(roundMetrics, state.metricId);
    const matchOption = scope?.querySelector('option[value="match"]');
    const roundOption = scope?.querySelector('option[value="round"]');
    if (matchOption) matchOption.disabled = roundOnly;
    if (roundOption) roundOption.disabled = !supportsRounds;
    if (roundOnly && scope?.value !== "round") scope.value = "round";
    if (!supportsRounds && scope?.value === "round") scope.value = "match";
    window.NickStatsDropdown.sync(scope);
    const roundsMode = scope?.value === "round";
    const typeControl = document.getElementById(`${prefix}GraphTypeControl`);
    if (typeControl) typeControl.hidden = roundsMode;
    const metric = registry.get(state.metricId) || registry.get("rating");
    const roundMetric = roundMetrics[metric.id];
    const prepared = state.series.map(series => ({ ...series, values: valuesFor(series, metric) })).filter(series => series.values.length);
    const domainPrepared = state.domainSeries.map(series => ({ ...series, values: valuesFor(series, metric) })).filter(series => series.values.length);
    const roundPrepared = roundsMode ? state.series.map(series => ({ ...series, roundValues: window.NickStatsRoundTimeline.averages(series.roundMatches || [], {}, roundMetric) })).filter(series => series.roundValues.length) : [];
    if (distributionStyleControl) distributionStyleControl.hidden = false;
    if (bucketControl) bucketControl.hidden = roundsMode || type.value !== "distribution";
    if (bucketCount) bucketCount.textContent = String(state.bucketCount);
    if (bucketLess) bucketLess.disabled = state.bucketCount <= MIN_BUCKETS;
    if (bucketMore) bucketMore.disabled = state.bucketCount >= MAX_BUCKETS;
    svg.setAttribute("viewBox", !roundsMode && type.value === "distribution" ? "0 0 900 460" : "0 0 900 420");
    svg.replaceChildren(); summary.replaceChildren(); legend.replaceChildren();
    const multiTrendNeedsDates = !roundsMode && type.value === "trend" && state.independent && independentTrendNeedsDates(prepared);
    note.textContent = roundsMode
      ? `Each ${distributionStyle?.value === "bars" ? "bar" : "point"} is average ${roundLabel(metric)} in that exact numbered round among matches where the player played it. Gaps mean no appearances. Older demos need reparsing.`
      : type.value === "distribution"
      ? "Each observation is one match. Bucket boundaries stay fixed across the available player pool; use − or + to change granularity."
      : multiTrendNeedsDates
        ? "Independent multi-player trends need reliable dates before their timelines can be aligned. Select one player for match order, or use Distribution for comparisons now."
        : "Values follow match date when available and match order otherwise. Hover a value for its match and statistic.";
    if (!(roundsMode ? roundPrepared : prepared).length) {
      const empty = document.createElement("p"); empty.className = "graph-empty"; empty.textContent = roundsMode ? "No per-round data for these matches. Reparse older demos to add round data." : "No qualifying match samples for this statistic."; summary.appendChild(empty); return;
    }
    if (roundsMode) {
      roundPrepared.forEach((series, index) => {
        const item = document.createElement("div"); item.className = "graph-summary-card";
        item.style.setProperty("--series-color", colors[(series.colorIndex ?? index) % colors.length]);
        const label = document.createElement("strong"); label.textContent = series.label;
        const details = document.createElement("span");
        details.textContent = `${series.roundValues.length} numbered rounds · ${series.roundValues.reduce((sum, point) => sum + point.appearances, 0)} played rounds`;
        item.append(label, details); summary.appendChild(item);
        const key = document.createElement("span"); key.className = "graph-legend-item";
        key.style.setProperty("--series-color", colors[(series.colorIndex ?? index) % colors.length]); key.textContent = series.label; legend.appendChild(key);
      });
      drawRounds(svg, roundPrepared, metric, distributionStyle?.value || "bars"); return;
    }
    prepared.forEach((series, index) => {
      const colorIndex = series.colorIndex ?? index;
      const values = series.values.map(point => point.value), item = document.createElement("div"); item.className = "graph-summary-card";
      item.style.setProperty("--series-color", colors[colorIndex % colors.length]);
      const label = document.createElement("strong"); label.textContent = series.label;
      const details = document.createElement("span"); details.textContent = `Mean ${format(mean(values), metric)} · Median ${format(median(values), metric)} · SD ${format(deviation(values), metric)} · Range ${format(Math.min(...values), metric)}–${format(Math.max(...values), metric)} · n=${values.length}`;
      item.append(label, details); summary.appendChild(item);
      const key = document.createElement("span"); key.className = "graph-legend-item"; key.style.setProperty("--series-color", colors[colorIndex % colors.length]); key.textContent = series.label; legend.appendChild(key);
    });
    if (multiTrendNeedsDates) {
      svg.appendChild(svgElement("text", { x: 450, y: 205, class: "graph-waiting-message", "text-anchor": "middle" }, "Dates needed to align these players’ trends"));
    } else type.value === "trend" ? drawTrend(svg, prepared, metric, distributionStyle?.value || "bars") : drawDistribution(svg, prepared, domainPrepared, metric, state.bucketCount, distributionStyle?.value || "bars");
  }

  function render({ prefix, series, domainSeries = series, independent = false }) {
    const type = document.getElementById(`${prefix}GraphType`), input = document.getElementById(`${prefix}GraphMetric`);
    if (!type || !input) return;
    const category = document.getElementById(`${prefix}GraphCategory`), controls = input.closest(".graph-stat-controls");
    if (category && !category.options.length) {
      ["All", ...metrics.map(([group]) => group)].forEach(group => {
        const option = document.createElement("option"); option.value = group; option.textContent = group === "All" ? "All categories" : group; category.appendChild(option);
      });
      category.value = "Core";
    }
    [category, type, document.getElementById(`${prefix}GraphScope`), document.getElementById(`${prefix}GraphDistributionStyle`)]
      .forEach(select => window.NickStatsDropdown.enhance(select));
    const previous = graphState.get(prefix);
    graphState.set(prefix, { series: series || [], domainSeries: domainSeries || series || [], independent,
      bucketCount: previous?.bucketCount || DEFAULT_BUCKETS, metricId: previous?.metricId || "rating",
      category: previous?.category || "Core", suggestions: previous?.suggestions || [], suggestionIndex: previous?.suggestionIndex ?? -1 });
    if (!previous) {
      input.value = registry.get("rating").label;
      type.addEventListener("change", () => draw(prefix));
      document.getElementById(`${prefix}GraphScope`)?.addEventListener("change", () => draw(prefix));
      category?.addEventListener("change", () => { input.value = ""; input.focus(); showSuggestions(prefix); });
      input.addEventListener("focus", () => { input.select(); showSuggestions(prefix); });
      input.addEventListener("input", () => showSuggestions(prefix, input.value));
      input.addEventListener("keydown", event => {
        if (event.key === "Escape") { closeSuggestions(prefix); input.blur(); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (document.getElementById(`${prefix}GraphSuggestions`).hidden) showSuggestions(prefix, "");
          moveSuggestion(prefix, event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Enter") {
          const state = graphState.get(prefix);
          if (state.suggestions.length) {
            event.preventDefault(); selectMetric(prefix, state.suggestions[Math.max(0, state.suggestionIndex)].id);
          }
        }
      });
      controls?.addEventListener("focusout", event => { if (!controls.contains(event.relatedTarget)) closeSuggestions(prefix); });
      document.addEventListener("pointerdown", event => { if (!controls?.contains(event.target)) closeSuggestions(prefix); });
      document.getElementById(`${prefix}GraphDistributionStyle`)?.addEventListener("change", () => draw(prefix));
      document.getElementById(`${prefix}GraphBucketsLess`)?.addEventListener("click", () => {
        const current = graphState.get(prefix); current.bucketCount = Math.max(MIN_BUCKETS, current.bucketCount - 1); draw(prefix);
      });
      document.getElementById(`${prefix}GraphBucketsMore`)?.addEventListener("click", () => {
        const current = graphState.get(prefix); current.bucketCount = Math.min(MAX_BUCKETS, current.bucketCount + 1); draw(prefix);
      });
    }
    draw(prefix);
  }

  window.NickStatsGraphs = Object.freeze({ metrics: registry, metricChoices, statsForMatch, samplesForMatches, independentTrendNeedsDates, distributionBounds, niceDistributionBounds, render });
})();
