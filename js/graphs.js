(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const colors = ["#6ca4ff", "#ffc969", "#55d6d2", "#be82ff", "#ff7b86"];
  const MIN_BUCKETS = 4;
  const MAX_BUCKETS = 24;
  const DEFAULT_BUCKETS = 10;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const ratio = (a, b) => number(b) > 0 ? number(a) / number(b) : number(a);
  const rate = key => stats => ratio(stats[key], stats.rounds);
  const count = key => stats => number(stats[key]);
  const percentage = (a, b) => stats => 100 * ratio(stats[a], stats[b]);

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
      ["kills", "Kills", count("kills"), 0], ["deaths", "Deaths", count("deaths"), 0], ["assists", "Assists", count("assists"), 0],
      ["kpr", "Kills per round", rate("kills"), 2], ["dpr", "Deaths per round", rate("deaths"), 2], ["apr", "Assists per round", rate("assists"), 2],
      ["hs", "Headshot rate", percentage("headshots", "kills"), 1, "%"], ["damage_diff", "Damage differential per round", stats => ratio(number(stats.damage) - number(stats.damage_received), stats.rounds), 1]
    ]],
    ["Opening", [
      ["opening_kpr", "Opening kills per round", rate("opening_kills"), 3], ["opening_dpr", "Opening deaths per round", rate("opening_deaths"), 3],
      ["opening_diff", "Opening differential", stats => number(stats.opening_kills) - number(stats.opening_deaths), 0],
      ["opening_success", "Opening success", stats => 100 * ratio(stats.opening_kills, number(stats.opening_kills) + number(stats.opening_deaths)), 1, "%"]
    ]],
    ["Trades", [
      ["trade_kpr", "Trade kills per round", rate("trade_kills"), 3], ["trade_response", "Trade response rate", percentage("trade_attempts", "trade_opportunities"), 1, "%"],
      ["trade_success", "Trade success rate", percentage("trade_successes", "trade_attempts"), 1, "%"], ["traded_death_rate", "Tradeable deaths converted", percentage("traded_deaths", "tradeable_deaths"), 1, "%"]
    ]],
    ["Utility", [
      ["utility_dr", "Utility damage per round", stats => ratio(number(stats.he_damage) + number(stats.fire_damage), stats.rounds), 1],
      ["he_dr", "HE damage per round", rate("he_damage"), 1], ["fire_dr", "Fire damage per round", rate("fire_damage"), 1],
      ["enemies_flashed_r", "Enemies flashed per round", rate("enemies_flashed"), 2], ["flash_assists_r", "Flash assists per round", rate("flash_assists"), 3],
      ["he_thrown_r", "HE grenades per round", rate("he_grenades_thrown"), 3], ["flashes_thrown_r", "Flashbangs per round", rate("flashbangs_thrown"), 3],
      ["smokes_thrown_r", "Smokes per round", rate("smokes_thrown"), 3], ["fire_thrown_r", "Fire grenades per round", rate("fire_grenades_thrown"), 3]
    ]],
    ["Rounds and context", [
      ["round_win", "Round win rate", percentage("round_wins", "rounds"), 1, "%"], ["clutches", "Clutches won", stats => [1, 2, 3, 4, 5].reduce((sum, n) => sum + number(stats[`clutch_1v${n}`]), 0), 0],
      ["clutch_success", "Clutch success", stats => {
        const wins = [1, 2, 3, 4, 5].reduce((sum, n) => sum + number(stats[`clutch_1v${n}`]), 0);
        const attempts = [1, 2, 3, 4, 5].reduce((sum, n) => sum + number(stats[`clutch_attempt_1v${n}`]), 0);
        return 100 * ratio(wins, attempts);
      }, 1, "%"],
      ["bullshit_kr", "Bullshit kills per round", rate("unfair_kills"), 3], ["bullshit_dr", "Bullshit deaths per round", rate("unfair_deaths"), 3],
      ["wallbang_kr", "Wallbang kills per round", rate("wallbang_kills"), 3], ["smoke_kr", "Smoke kills per round", rate("smoke_kills"), 3],
      ["paul_kr", "Paul kills per round", rate("equipment_disadvantage_kills"), 3], ["paul_dr", "Paul deaths per round", rate("equipment_disadvantage_deaths"), 3]
    ]]
  ];

  const registry = new Map(metrics.flatMap(([group, entries]) => entries.map(([id, label, value, digits, suffix = ""]) => [id, { id, group, label, value, digits, suffix }])));
  const graphState = new Map();

  function mergeStats(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
      target[key] = key.endsWith("_max") ? Math.max(number(target[key]), number(value)) : number(target[key]) + number(value);
    }
  }

  function statsForMatch(match, side = "ALL") {
    const stats = {}, sides = match.sides || match.sideRows || [];
    const selected = sides.filter(row => side === "ALL" || row.side === side);
    selected.forEach(row => mergeStats(stats, row.stats));
    if (!selected.length && side === "ALL") mergeStats(stats, match.legacy || match);
    return stats;
  }

  function samplesForMatches(matches, side = "ALL") {
    return (matches || []).map((match, index) => ({
      id: String(match.id ?? index),
      date: number(match.played_at ?? match.date),
      result: match.result,
      map: match.map,
      stats: statsForMatch(match, side)
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

  function drawTrend(svg, prepared, metric) {
    const allPoints = prepared.flatMap(series => series.values);
    if (!allPoints.length) return;
    let min = Math.min(...allPoints.map(point => point.value)), max = Math.max(...allPoints.map(point => point.value));
    if (min === max) { const padding = Math.abs(min) * .1 || 1; min -= padding; max += padding; }
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
    prepared.forEach((series, seriesIndex) => {
      const colorIndex = series.colorIndex ?? seriesIndex;
      const ordered = [...series.values].sort((a, b) => positions.get(a.id) - positions.get(b.id));
      const coordinates = ordered.map(point => {
        const x = left + width * positions.get(point.id) / Math.max(1, matches.length - 1);
        const y = top + height - height * (point.value - min) / (max - min);
        return { point, x, y };
      });
      svg.appendChild(svgElement("polyline", { points: coordinates.map(({ x, y }) => `${x},${y}`).join(" "), class: "graph-series-line", stroke: colors[colorIndex % colors.length] }));
      coordinates.forEach(({ point, x, y }) => {
        const dot = svgElement("circle", { cx: x, cy: y, r: 4, fill: colors[colorIndex % colors.length], class: "graph-point" });
        const date = point.date > 0 ? new Date(point.date * 1000).toLocaleDateString() : `Match #${point.id}`;
        svg.appendChild(dot); attachTooltip(svg, dot, `${series.label} · ${date}: ${format(point.value, metric)}`, x, y);
      });
    });
    svg.appendChild(svgElement("text", { x: left + width / 2, y: 396, class: "graph-axis-title", "text-anchor": "middle" }, allDated ? "Match date" : "Match order"));
    svg.appendChild(svgElement("text", { x: 17, y: top + height / 2, class: "graph-axis-title", transform: `rotate(-90 17 ${top + height / 2})`, "text-anchor": "middle" }, metric.label));
  }

  function populateMetrics(select) {
    if (select.options.length) return;
    metrics.forEach(([group, entries]) => {
      const optionGroup = document.createElement("optgroup"); optionGroup.label = group;
      entries.forEach(([id, label]) => { const option = document.createElement("option"); option.value = id; option.textContent = label; optionGroup.appendChild(option); });
      select.appendChild(optionGroup);
    });
  }

  function draw(prefix) {
    const state = graphState.get(prefix); if (!state) return;
    const type = document.getElementById(`${prefix}GraphType`), metricSelect = document.getElementById(`${prefix}GraphMetric`);
    const svg = document.getElementById(`${prefix}GraphSvg`), summary = document.getElementById(`${prefix}GraphSummary`);
    const legend = document.getElementById(`${prefix}GraphLegend`), note = document.getElementById(`${prefix}GraphNote`);
    const distributionStyleControl = document.getElementById(`${prefix}GraphDistributionStyleControl`);
    const distributionStyle = document.getElementById(`${prefix}GraphDistributionStyle`);
    const bucketControl = document.getElementById(`${prefix}GraphBucketControl`), bucketCount = document.getElementById(`${prefix}GraphBucketCount`);
    const bucketLess = document.getElementById(`${prefix}GraphBucketsLess`), bucketMore = document.getElementById(`${prefix}GraphBucketsMore`);
    if (!type || !metricSelect || !svg || !summary || !legend || !note) return;
    const metric = registry.get(metricSelect.value) || registry.get("rating");
    const prepared = state.series.map(series => ({ ...series, values: valuesFor(series, metric) })).filter(series => series.values.length);
    const domainPrepared = state.domainSeries.map(series => ({ ...series, values: valuesFor(series, metric) })).filter(series => series.values.length);
    if (distributionStyleControl) distributionStyleControl.hidden = type.value !== "distribution";
    if (bucketControl) bucketControl.hidden = type.value !== "distribution";
    if (bucketCount) bucketCount.textContent = String(state.bucketCount);
    if (bucketLess) bucketLess.disabled = state.bucketCount <= MIN_BUCKETS;
    if (bucketMore) bucketMore.disabled = state.bucketCount >= MAX_BUCKETS;
    svg.setAttribute("viewBox", type.value === "distribution" ? "0 0 900 460" : "0 0 900 420");
    svg.replaceChildren(); summary.replaceChildren(); legend.replaceChildren();
    const multiTrendNeedsDates = type.value === "trend" && state.independent && independentTrendNeedsDates(prepared);
    note.textContent = type.value === "distribution"
      ? "Each observation is one match. Bucket boundaries stay fixed across the available player pool; use − or + to change granularity."
      : multiTrendNeedsDates
        ? "Independent multi-player trends need reliable dates before their timelines can be aligned. Select one player for match order, or use Distribution for comparisons now."
        : "Points follow match date when available and match order otherwise. Hover a point for its match and value.";
    if (!prepared.length) {
      const empty = document.createElement("p"); empty.className = "graph-empty"; empty.textContent = "No qualifying match samples for this statistic."; summary.appendChild(empty); return;
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
    } else type.value === "trend" ? drawTrend(svg, prepared, metric) : drawDistribution(svg, prepared, domainPrepared, metric, state.bucketCount, distributionStyle?.value || "bars");
  }

  function render({ prefix, series, domainSeries = series, independent = false }) {
    const type = document.getElementById(`${prefix}GraphType`), metric = document.getElementById(`${prefix}GraphMetric`);
    if (!type || !metric) return;
    populateMetrics(metric);
    const previous = graphState.get(prefix);
    if (!previous) {
      type.addEventListener("change", () => draw(prefix)); metric.addEventListener("change", () => draw(prefix));
      document.getElementById(`${prefix}GraphDistributionStyle`)?.addEventListener("change", () => draw(prefix));
      document.getElementById(`${prefix}GraphBucketsLess`)?.addEventListener("click", () => {
        const current = graphState.get(prefix); current.bucketCount = Math.max(MIN_BUCKETS, current.bucketCount - 1); draw(prefix);
      });
      document.getElementById(`${prefix}GraphBucketsMore`)?.addEventListener("click", () => {
        const current = graphState.get(prefix); current.bucketCount = Math.min(MAX_BUCKETS, current.bucketCount + 1); draw(prefix);
      });
    }
    graphState.set(prefix, { series: series || [], domainSeries: domainSeries || series || [], independent, bucketCount: previous?.bucketCount || DEFAULT_BUCKETS }); draw(prefix);
  }

  window.NickStatsGraphs = Object.freeze({ metrics: registry, statsForMatch, samplesForMatches, independentTrendNeedsDates, distributionBounds, niceDistributionBounds, render });
})();
