(() => {
  "use strict";

  const state = {
    files: [],
    analysis: null,
    analyses: { csstats: null, faceit: null },
    activeSource: "csstats",
    activeTab: "group"
  };
  const sourceLabels = { csstats: "CSStats files", faceit: "FACEIT API" };
  const { filterIds, filterNames, scoring } = window.CSStatsConfig;
  const $ = id => document.getElementById(id);

  function setStatus(message, error = false) {
    $("status").textContent = message;
    $("status").classList.toggle("error", error);
  }

  function prettyFileLabel(filename, alias) {
    const stem = filename.replace(/\.(?:html?|txt)$/i, "").trim();
    if (!stem || /^pasted[ _-]*text/i.test(stem)) return alias;
    return stem.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function renderFileList() {
    const list = $("fileList");
    list.replaceChildren();
    state.files.forEach((file, index) => {
      const chip = document.createElement("div");
      chip.className = "file-chip";
      const name = document.createElement("span");
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        state.files.splice(index, 1);
        clearAnalysis("csstats");
        renderFileList();
      });
      chip.append(name, remove);
      list.appendChild(chip);
    });
    const enough = state.files.length >= 2;
    $("analyzeButton").disabled = !enough;
    $("clearButton").disabled = state.files.length === 0;
    setStatus(enough ? `${state.files.length} files ready.` : "Choose at least two files.");
  }

  function addFiles(files) {
    const known = new Set(state.files.map(file => `${file.name}:${file.size}:${file.lastModified}`));
    for (const file of files) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!known.has(key)) { state.files.push(file); known.add(key); }
    }
    renderFileList();
  }

  function selectedFilter(doc, id) {
    const select = doc.getElementById(id);
    if (!select) return null;
    const option = select.querySelector("option[selected]") || select.options[select.selectedIndex] || select.options[0];
    return option ? { value: option.value, label: option.textContent.trim() || option.value } : null;
  }

  function extractJsonObject(text, markerPattern) {
    const marker = markerPattern.exec(text);
    if (!marker) return null;
    let start = marker.index + marker[0].length;
    while (/\s/.test(text[start] || "")) start++;
    if (text[start] !== "{") return null;
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
    }
    return null;
  }

  function num(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function normalizeMatch(row) {
    const score = Array.isArray(row.score) ? row.score : [0, 0];
    return {
      id: Math.trunc(num(row.id)), date: Math.trunc(num(row.date)), result: ["w", "l", "n"].includes(row.result) ? row.result : "n",
      k: num(row.k), d: num(row.d), a: num(row.a), hs: num(row.hs), adr: num(row.adr), rating: num(row.rating),
      map: String(row.map || "Unknown"), score: [num(score[0]), num(score[1])]
    };
  }

  function fallbackRows(doc) {
    return Array.from(doc.querySelectorAll("#match-list-body tr.p-row")).map(tr => {
      const cells = Array.from(tr.children);
      const id = tr.querySelector('a[href*="/match/"]')?.href.match(/\/match\/(\d+)/)?.[1];
      const date = tr.querySelector("[data-timestamp]")?.getAttribute("data-timestamp");
      const score = (cells[3]?.textContent || "0:0").match(/(\d+)\s*:\s*(\d+)/);
      const value = index => num((cells[index]?.textContent || "").replace("*", "").trim());
      const first = score ? num(score[1]) : 0, second = score ? num(score[2]) : 0;
      return normalizeMatch({ id, date, result: first > second ? "w" : first < second ? "l" : "n", score: [first, second], map: cells[2]?.textContent.trim(), k: value(5), d: value(6), a: value(7), hs: value(9), adr: value(10), rating: value(19) });
    }).filter(row => row.id);
  }

  async function parseExport(file) {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, "text/html");
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
    const profileId = (canonical.match(/\/player\/(\d+)/) || text.match(/\/player\/(\d+)/))?.[1];
    const title = (doc.querySelector("title")?.textContent || "").replace(/\s+/g, " ").trim();
    const alias = title.match(/Player statistics\s*-\s*(.*?)\s*\|\s*CS2 Stats/i)?.[1]?.trim() || `Player ${profileId || ""}`;
    const filters = {};
    filterIds.forEach(id => { filters[id] = selectedFilter(doc, id); });

    let rows = [];
    const objectText = extractJsonObject(text, /window\.MATCH_DATA\s*=\s*/g);
    if (objectText) {
      try { rows = (JSON.parse(objectText).rows || []).map(normalizeMatch); }
      catch (_) { rows = fallbackRows(doc); }
    } else rows = fallbackRows(doc);

    rows = Array.from(new Map(rows.filter(row => row.id).map(row => [row.id, row])).values());
    if (!profileId) throw new Error(`${file.name} does not look like a saved CSStats profile.`);
    if (!rows.length) throw new Error(`No matches were found in ${file.name}.`);
    return { fileName: file.name, label: prettyFileLabel(file.name, alias), alias, profileId, source: "csstats", filters, rows };
  }

  function summarize(rows) {
    const n = rows.length;
    const sum = key => rows.reduce((total, row) => total + num(row[key]), 0);
    const kills = sum("k"), deaths = sum("d");
    const wins = rows.filter(row => row.result === "w").length;
    const losses = rows.filter(row => row.result === "l").length;
    const ties = rows.filter(row => row.result === "n").length;
    return {
      n, wins, losses, ties, kills, deaths, assists: sum("a"),
      winRate: n ? 100 * wins / n : 0,
      rating: n ? sum("rating") / n : 0,
      adr: n ? sum("adr") / n : 0,
      kd: deaths ? kills / deaths : kills ? Infinity : 0,
      avgK: n ? kills / n : 0,
      avgD: n ? deaths / n : 0,
      avgA: n ? sum("a") / n : 0,
      avgHs: n ? sum("hs") / n : 0
    };
  }

  function classify(score) {
    return score >= scoring.lifterThreshold ? "Lifter" : score <= scoring.draggerThreshold ? "Dragger" : "Exister";
  }

  function pairImpact(target, actor) {
    const actorIds = new Set(actor.rows.map(row => row.id));
    const isTogether = row => Array.isArray(row.teammateIds)
      ? row.teammateIds.includes(actor.profileId)
      : actorIds.has(row.id);
    const withRows = target.rows.filter(isTogether);
    const withoutRows = target.rows.filter(row => !isTogether(row));
    const withStats = summarize(withRows), withoutStats = summarize(withoutRows);
    const delta = {
      winRate: withStats.winRate - withoutStats.winRate,
      rating: withStats.rating - withoutStats.rating,
      adr: withStats.adr - withoutStats.adr,
      kd: withStats.kd - withoutStats.kd
    };
    const effectiveN = withRows.length && withoutRows.length ? withRows.length * withoutRows.length / (withRows.length + withoutRows.length) : 0;
    const rawScore = scoring.winRateWeight * (delta.winRate / scoring.winRateScale) + scoring.ratingWeight * (delta.rating / scoring.ratingScale);
    const reliability = effectiveN / (effectiveN + scoring.shrinkage);
    const score = rawScore * reliability;
    return {
      target, actor, withN: withRows.length, withoutN: withoutRows.length,
      withStats, withoutStats, delta, effectiveN, reliability, score,
      classification: classify(score),
      confidence: Math.min(withRows.length, withoutRows.length) < 10 ? "Low" : effectiveN < 25 ? "Medium" : "High"
    };
  }

  function buildAnalysis(players) {
    const pairs = [];
    for (const target of players) for (const actor of players) if (target.profileId !== actor.profileId) pairs.push(pairImpact(target, actor));
    const overall = players.map(actor => {
      const effects = pairs.filter(pair => pair.actor.profileId === actor.profileId);
      const totalWeight = effects.reduce((sum, pair) => sum + pair.effectiveN, 0) || 1;
      const weighted = getter => effects.reduce((sum, pair) => sum + getter(pair) * pair.effectiveN, 0) / totalWeight;
      const score = weighted(pair => pair.score);
      return {
        player: actor, score, classification: classify(score),
        delta: {
          winRate: weighted(pair => pair.delta.winRate),
          rating: weighted(pair => pair.delta.rating),
          adr: weighted(pair => pair.delta.adr),
          kd: weighted(pair => pair.delta.kd)
        }
      };
    }).sort((a, b) => b.score - a.score);
    return { players, pairs, overall };
  }

  function signed(value, digits = 1, suffix = "") {
    const rounded = Math.abs(value).toFixed(digits);
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${rounded}${suffix}`;
  }

  function signClass(value, neutralBand = 0) {
    return value > neutralBand ? "positive" : value < -neutralBand ? "negative" : "neutral";
  }

  function el(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function renderWarnings(players) {
    const warnings = [];
    const first = players[0];
    for (const player of players.slice(1)) {
      for (const id of filterIds) {
        const a = first.filters[id], b = player.filters[id];
        if (a && b && a.value !== b.value) warnings.push(`${player.label} uses a different ${filterNames[id]} (${b.label} vs ${a.label}).`);
      }
    }
    for (const player of players) {
      if (player.missingRatings) warnings.push(`${player.label}: ${player.missingRatings} FACEIT matches had no recognized rating field; those rating values are shown as 0 in this test version.`);
    }
    const container = $("warnings");
    container.replaceChildren(...warnings.map(message => el("div", message, "warning")));
  }

  function renderOverall(overall) {
    const grid = $("verdictGrid");
    grid.replaceChildren();
    for (const item of overall) {
      const kind = item.classification.toLowerCase();
      const card = el("article", undefined, `verdict-card ${kind}`);
      const top = el("div", undefined, "verdict-top");
      top.append(el("div", item.player.label, "player-name"), el("span", item.classification, `badge ${kind}`));
      const alias = el("div", item.player.alias === item.player.label ? `${item.player.rows.length} matches` : `${item.player.alias} · ${item.player.rows.length} matches`, "alias");
      const deltas = el("div", undefined, "delta-row");
      const win = el("div", undefined, "delta");
      win.append(el("strong", signed(item.delta.winRate, 1, " pp"), signClass(item.delta.winRate, 1)), el("span", "Other players’ win rate"));
      const rating = el("div", undefined, "delta");
      rating.append(el("strong", signed(item.delta.rating, 3), signClass(item.delta.rating, .01)), el("span", "Other players’ rating"));
      deltas.append(win, rating);
      card.append(top, alias, deltas);
      grid.appendChild(card);
    }
  }

  function renderFunFacts(analysis) {
    const { players, pairs, overall } = analysis;
    const pairMap = new Map(pairs.map(pair => [`${pair.target.profileId}:${pair.actor.profileId}`, pair]));
    const unordered = [];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const aWithB = pairMap.get(`${a.profileId}:${b.profileId}`);
        const bWithA = pairMap.get(`${b.profileId}:${a.profileId}`);
        unordered.push({
          a, b, aWithB, bWithA,
          shared: aWithB.withN,
          chemistry: aWithB.score + bWithA.score,
          asymmetry: Math.abs(aWithB.score - bWithA.score)
        });
      }
    }

    const maxBy = (items, getter) => items.reduce((best, item) => !best || getter(item) > getter(best) ? item : best, null);
    const minBy = (items, getter) => items.reduce((best, item) => !best || getter(item) < getter(best) ? item : best, null);
    const topOverall = overall[0];
    const bottomOverall = overall[overall.length - 1];
    const bestChemistry = maxBy(unordered, item => item.chemistry);
    const worstChemistry = minBy(unordered, item => item.chemistry);
    const oddCouple = maxBy(unordered, item => item.asymmetry);
    const inseparable = maxBy(unordered, item => item.shared);
    const statLines = players.map(player => ({ player, stats: summarize(player.rows) }));
    const statMonster = maxBy(statLines, item => item.stats.rating);
    const ironman = maxBy(players, player => player.rows.length);
    const mostPolarizing = maxBy(players.map(player => {
      const values = pairs.filter(pair => pair.actor.profileId === player.profileId).map(pair => pair.score);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      return { player, spread: Math.sqrt(variance), low: Math.min(...values), high: Math.max(...values) };
    }), item => item.spread);

    const oddNegative = oddCouple.aWithB.score < oddCouple.bWithA.score ? oddCouple.aWithB : oddCouple.bWithA;
    const oddOther = oddNegative === oddCouple.aWithB ? oddCouple.bWithA : oddCouple.aWithB;
    const sampleNote = pair => pair.withN < 10 ? ` Only ${pair.withN} shared matches, so handle with care.` : "";
    const facts = [
      {
        icon: "🚀", kicker: "Lobby elevator", value: topOverall.player.label,
        copy: `Best groupwide effect: ${signed(topOverall.delta.winRate, 1, " pp")} win rate and ${signed(topOverall.delta.rating, 3)} rating for teammates.`
      },
      {
        icon: "🪨", kicker: "Gravity well", value: bottomOverall.player.label,
        copy: `Lowest groupwide effect: ${signed(bottomOverall.delta.winRate, 1, " pp")} win rate and ${signed(bottomOverall.delta.rating, 3)} rating for teammates.`
      },
      {
        icon: "🤝", kicker: "Best chemistry", value: `${bestChemistry.a.label} + ${bestChemistry.b.label}`,
        copy: `The strongest mutual pairing, across ${bestChemistry.shared} shared matches.${sampleNote(bestChemistry.aWithB)}`
      },
      {
        icon: "🧪", kicker: "Cursed chemistry", value: `${worstChemistry.a.label} + ${worstChemistry.b.label}`,
        copy: `The weakest combined two-way effect, across ${worstChemistry.shared} shared matches.${sampleNote(worstChemistry.aWithB)}`
      },
      {
        icon: "↔️", kicker: "One-way street", value: `${oddNegative.actor.label} → ${oddNegative.target.label}`,
        copy: `${oddNegative.actor.label} scores ${signed(oddNegative.score, 2)} for ${oddNegative.target.label}, while the reverse direction is ${signed(oddOther.score, 2)}.`
      },
      {
        icon: "🔗", kicker: "Inseparable", value: `${inseparable.a.label} + ${inseparable.b.label}`,
        copy: `${inseparable.shared} shared matches—the most frequent duo in this set.`
      },
      {
        icon: "🎯", kicker: "Stat monster", value: statMonster.player.label,
        copy: `Highest raw average rating at ${statMonster.stats.rating.toFixed(2)}, with ${statMonster.stats.adr.toFixed(1)} ADR and a ${statMonster.stats.kd.toFixed(2)} K/D.`
      },
      {
        icon: "🎢", kicker: "Most polarizing", value: mostPolarizing.player.label,
        copy: `Their pair effects range from ${signed(mostPolarizing.low, 2)} to ${signed(mostPolarizing.high, 2)} depending on the teammate.`
      },
      {
        icon: "🕹️", kicker: "Ironman", value: ironman.label,
        copy: `${ironman.rows.length} recorded matches—the largest workload in the loaded date range.`
      }
    ];

    const grid = $("funFacts");
    grid.replaceChildren();
    for (const fact of facts) {
      const card = el("article", undefined, "fact-card");
      card.append(el("div", fact.icon, "fact-icon"), el("div", fact.kicker, "fact-kicker"), el("div", fact.value, "fact-value"), el("p", fact.copy, "fact-copy"));
      grid.appendChild(card);
    }
  }

  function renderMatrix(analysis) {
    const { players, pairs } = analysis;
    const pairMap = new Map(pairs.map(pair => [`${pair.target.profileId}:${pair.actor.profileId}`, pair]));
    const headRow = document.createElement("tr");
    headRow.appendChild(el("th", "Measured ↓ / Present →"));
    players.forEach(player => headRow.appendChild(el("th", player.label)));
    $("matrixHead").replaceChildren(headRow);

    const body = $("matrixBody");
    body.replaceChildren();
    for (const target of players) {
      const tr = document.createElement("tr");
      tr.appendChild(el("td", target.label));
      for (const actor of players) {
        const td = document.createElement("td");
        if (target.profileId === actor.profileId) td.appendChild(el("span", "—", "diagonal"));
        else {
          const pair = pairMap.get(`${target.profileId}:${actor.profileId}`);
          const kind = pair.classification.toLowerCase();
          const box = el("div", undefined, `matrix-cell ${kind}`);
          box.append(el("strong", pair.classification), el("small", `${signed(pair.delta.winRate, 1, "pp")} · ${signed(pair.delta.rating, 2)}R`));
          box.title = `${target.label} with ${actor.label}: ${pair.withN} matches; without: ${pair.withoutN}; 80% win-rate delta and 20% rating delta; ${pair.confidence.toLowerCase()} confidence.`;
          td.appendChild(box);
        }
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  function renderDetails(pairs) {
    const body = $("detailsBody");
    body.replaceChildren();
    for (const pair of pairs) {
      const tr = document.createElement("tr");
      const values = [
        pair.target.label, pair.actor.label, pair.classification, pair.withN, pair.withoutN,
        signed(pair.delta.winRate, 1, " pp"), signed(pair.delta.rating, 3), pair.confidence
      ];
      values.forEach((value, index) => {
        const td = el("td", value);
        if (index === 2) td.className = pair.classification.toLowerCase() === "lifter" ? "positive" : pair.classification.toLowerCase() === "dragger" ? "negative" : "neutral";
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
  }

  function switchTab(tab) {
    state.activeTab = tab;
    const group = tab === "group";
    const combo = tab === "combo";
    $("groupTab").setAttribute("aria-selected", String(group));
    $("comboTab").setAttribute("aria-selected", String(combo));
    $("groupView").hidden = !group;
    $("comboView").hidden = !combo;
    if (combo) window.CSStatsCombinations.activate();
  }

  function render(analysis) {
    renderWarnings(analysis.players);
    renderOverall(analysis.overall);
    window.CSStatsChart.renderImpactChart(analysis, { $, summarize, signed });
    renderFunFacts(analysis);
    renderMatrix(analysis);
    renderDetails(analysis.pairs);
    window.CSStatsCombinations.setPlayers(analysis.players);
    $("analysisSource").textContent = `Showing ${sourceLabels[state.activeSource]}`;
    switchTab(state.activeTab);
    $("results").hidden = false;
  }

  function loadPlayers(source, players) {
    const unique = [];
    const seen = new Set();
    for (const player of players) {
      if (!player?.profileId || seen.has(player.profileId)) continue;
      seen.add(player.profileId);
      unique.push(player);
    }
    if (unique.length < 2) throw new Error("At least two different profiles are required.");
    unique.sort((a, b) => a.label.localeCompare(b.label));
    const analysis = buildAnalysis(unique);
    state.analyses[source] = analysis;
    if (state.activeSource === source) {
      state.analysis = analysis;
      render(analysis);
    }
    return analysis;
  }

  function clearAnalysis(source) {
    state.analyses[source] = null;
    if (state.activeSource === source) {
      state.analysis = null;
      window.CSStatsCombinations.clear();
      $("results").hidden = true;
    }
  }

  function switchSource(source) {
    if (!Object.hasOwn(sourceLabels, source)) return;
    state.activeSource = source;
    const csstats = source === "csstats";
    $("csstatsSourceTab").setAttribute("aria-selected", String(csstats));
    $("faceitSourceTab").setAttribute("aria-selected", String(!csstats));
    $("csstatsSource").hidden = !csstats;
    $("faceitSource").hidden = csstats;
    state.analysis = state.analyses[source];
    if (state.analysis) render(state.analysis);
    else {
      window.CSStatsCombinations.clear();
      $("results").hidden = true;
    }
  }

  async function analyze() {
    $("analyzeButton").disabled = true;
    setStatus("Reading profiles and comparing every pair…");
    try {
      const parsed = await Promise.all(state.files.map(parseExport));
      const analysis = loadPlayers("csstats", parsed);
      setStatus(`Done: ${analysis.players.length} players and ${analysis.pairs.length} pairwise comparisons.`);
    } catch (error) {
      clearAnalysis("csstats");
      setStatus(error.message || "The profiles could not be analyzed.", true);
    } finally {
      $("analyzeButton").disabled = state.files.length < 2;
    }
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadCsv() {
    if (!state.analysis) return;
    const headers = ["measured_player", "player_present", "classification", "matches_with", "matches_without", "delta_win_rate_pp", "delta_rating", "adjusted_impact_score", "confidence"];
    const lines = [headers.join(",")];
    for (const pair of state.analysis.pairs) {
      lines.push([
        pair.target.label, pair.actor.label, pair.classification, pair.withN, pair.withoutN,
        pair.delta.winRate, pair.delta.rating, pair.score, pair.confidence
      ].map(csvCell).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.activeSource}-lifter-dragger-matrix.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const input = $("fileInput");
  input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
  const zone = $("dropZone");
  ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
  zone.addEventListener("drop", event => addFiles(event.dataTransfer.files));
  $("analyzeButton").addEventListener("click", analyze);
  $("clearButton").addEventListener("click", () => { state.files = []; clearAnalysis("csstats"); renderFileList(); });
  $("downloadButton").addEventListener("click", downloadCsv);
  $("groupTab").addEventListener("click", () => switchTab("group"));
  $("comboTab").addEventListener("click", () => switchTab("combo"));
  $("csstatsSourceTab").addEventListener("click", () => switchSource("csstats"));
  $("faceitSourceTab").addEventListener("click", () => switchSource("faceit"));

  window.CSStatsApp = Object.freeze({ loadPlayers, clearAnalysis, switchSource });
})();
