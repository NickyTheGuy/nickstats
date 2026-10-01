(() => {
  "use strict";

  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  const sections = Object.freeze([
    ["overview", "Overview", ["combat"], "overview"], ["opening", "Opening", ["opening"], "opening"],
    ["initiation", "Initiation", ["initiation"], "initiation"], ["trades", "Trades", ["trades"], "trades"], ["rounds", "Rounds", ["clutches", "multikills", "objectives"], "rounds"],
    ["roundState", "Round state", ["roundState", "killStage", "timing"], "roundState"],
    ["context", "Context", ["killContext"], "killContext"], ["movement", "Movement", ["movement"], "movement"],
    ["utility", "Utility", ["utility"], "utility"]
  ]);
  const groups = Object.freeze([
    ["combat", "Overview"], ["opening", "Opening"], ["initiation", "Initiation"], ["trades", "Trades"], ["clutches", "Clutches"],
    ["multikills", "Kill rounds"], ["objectives", "Objectives"], ["roundState", "Man count"],
    ["killStage", "Kill stage"], ["timing", "Round timing"], ["killContext", "Context"],
    ["movement", "Movement"], ["utility", "Utility"]
  ]);
  const columns = Object.freeze({
    combat: [["K", "D", "A", "K/D", "HS%", "Damage", "Received", "Diff", "ADR"], "K-D-A"],
    opening: [["K", "D", "Assisted K", "Dmg A", "K on ally flash", "Traded D", "Trade K", "A earned", "Dmg A earned", "A from your flash", "Enemy blind K", "K while blind", "D while blind", "D to blind killer", "Enemy assisted D", "Enemy dmg A D", "D on killer's ally flash", "K on your flash", "K on their flash", "D to killer's flash", "D to your side's flash", "Attempt rate", "Diff", "Success", "Assist %"], "K-D · Att%"],
    initiation: [["Initiations", "Initiation rounds %"], "Initiation rounds %"],
    trades: [["K Opp", "K Att", "K (Succ%)", "D Opp", "D Att", "D (Succ%)"], "K-D"],
    clutches: [["1v5", "1v4", "1v3", "1v2", "1v1", "Expected attempt value", "Avg / situation", "Estimated situations"], "Total W/A · Win%"],
    multikills: [["5K", "4K", "3K", "2K", "1K", "Multi%", "5K", "4K", "3K", "2K", "TMK%"], "Total"],
    objectives: [["Plants", "Defuses"], "Plants/defuses"],
    roundState: [["Clawback-Bozo K-D", "Even K-D", "Advantage K / Outnumbered D", "Cleanup K-D"], "Clawback-Bozo K-D"],
    killStage: [["5 alive K-D", "4 alive K-D", "3 alive K-D", "2 alive K-D", "1 alive K-D"], "5/1 alive K"],
    timing: [["Avg kill", "Avg death", "Early K-D", "Mid K-D", "Late K-D", "Post-plant K-D"], "Avg K/D time"],
    killContext: [["Enemy blind K-D", "Killer blind K-D", "Wallbang K-D", "Smoke K-D", "Air K-D", "Grenade out K-D", "Knife out K-D", "Paul K-D", "Run K-D"], "Bullshit K-D"],
    movement: [["Move K-D", "Still K-D", "Run K-D", "Air K-D", "Kill speed avg/max", "Kill speed avg/peak %", "Enemy speed avg/max", "Enemy speed avg/peak %"], "Move/run/air"],
    utility: [["HE Dmg", "Fire Dmg", "HE thrown", "Flash thrown", "Smoke thrown", "Fire thrown", "Decoy thrown", "EF", "Enemy sec", "TF", "Ally blind sec", "SF", "Self-blind sec", "FA", "Damage assist", "K on ally flash", "K on your flash"], "Damage · thrown"]
  });
  const subgroups = Object.freeze({
    combat: [["output", "Output", [0, 1, 2, 3, 4], "Overview"], ["damage", "Damage", [5, 6, 7, 8], "Damage"]],
    opening: [["results", "Results", [0, 1, 21, 22, 23], "Opening results"], ["received", "Help received", [2, 3, 4, 5, 24], "Opening help received"], ["given", "Help given", [6, 7, 8, 9], "Opening help given"],
      ["flashKills", "Flash kills", [10, 11, 17, 18], "Opening kills · flash"],
      ["flashDeaths", "Flash deaths", [12, 13, 19, 20], "Opening deaths · flash"],
      ["enemyAssists", "Enemy assists", [14, 15, 16], "Opening deaths · enemy assists"]],
    clutches: [["performance", "Performance", [0, 1, 2, 3, 4], "Clutches"], ["economics", "Economics", [5, 6, 7], "Clutch economics"]],
    multikills: [["regular", "Regular", [0, 1, 2, 3, 4, 5], "Multi-kills"], ["true", "True", [6, 7, 8, 9, 10], "True multi-kills"]],
    killContext: [["visibility", "Visibility and cover", [0, 1, 2, 3, 4], "Visibility and cover"], ["readiness", "Readiness", [5, 6, 7, 8], "Readiness"]],
    movement: [["state", "State", [0, 1, 2, 3], "Movement"], ["speed", "Speed", [4, 5, 6, 7], "Movement speed"]],
    utility: [["damage", "Damage", [0, 1], "Utility damage"], ["usage", "Usage", [2, 3, 4, 5, 6], "Utility usage"], ["flashes", "Flash effects", [7, 8, 9, 10, 11, 12, 13], "Flash effects"], ["assists", "Assisted kills", [14, 15, 16], "Utility assisted kills"]]
  });
  const expandedWidths = Object.freeze({
    combat: [54, 54, 54, 62, 62, 82, 88, 76, 72],
    opening: [58, 58, 82, 68, 126, 88, 68, 76, 76, 130, 82, 100, 100, 126, 104, 112, 164, 110, 112, 126, 152, 82, 62, 72, 76],
    initiation: [110, 164],
    trades: [58, 54, 96, 58, 54, 96], clutches: [94, 94, 94, 94, 94, 176, 142, 146],
    multikills: [55, 55, 55, 55, 55, 72, 55, 55, 55, 55, 72], objectives: [74, 74],
    roundState: [128, 88, 168, 104], killStage: [92, 92, 92, 92, 92], timing: [82, 82, 84, 84, 84, 112],
    killContext: [104, 104, 98, 88, 88, 112, 104, 88, 88], movement: [88, 88, 88, 88, 116, 132, 126, 142],
    utility: [82, 82, 86, 94, 94, 94, 94, 58, 92, 58, 112, 58, 100, 58, 100, 128, 128]
  });
  const collapsedWidths = Object.freeze({
    combat: 90, opening: 108, initiation: 164, trades: 88, clutches: 122, multikills: 92, objectives: 128,
    roundState: 112, killStage: 104, timing: 110, killContext: 112, movement: 112, utility: 176
  });
  const flashDescriptions = Object.freeze({
    "Paul K-D": "Kills against enemies caught with a grenade or knife out at death or within the prior 1.4 seconds; deaths caught the same way"
  });

  const groupSection = Object.freeze(Object.fromEntries(sections.flatMap(([section, , values]) => values.map(group => [group, section]))));

  function clutchEconomics(counters, prefix = "") {
    if (!counters) return { attempted: 0, measured: 0, total: null, average: null };
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const outcomes = ["win_survive", "win_die", "loss_survive", "loss_die"];
    const attempted = outcomes.reduce((sum, outcome) => sum + number(counters[`${prefix}${outcome}_count`]), 0);
    let measured = 0, total = 0;
    for (const side of ["t", "ct"]) for (let size = 1; size <= 5; size++) {
      const read = (outcome, key) => number(counters[`${prefix}${outcome}_${side}${size}_${key}`]);
      const wins = read("win_survive", "count") + read("win_die", "count");
      const failures = read("loss_die", "count");
      // Saves do not count as failed attempts. Require a useful history and
      // smooth small samples with one win and one failure, rather than 0/100%.
      if (wins + failures < 5) continue;
      const winChance = (wins + 1) / (wins + failures + 2);
      const dieOnWin = (read("win_die", "count") + 1) / (wins + 2);
      const lateFailure = failures ? read("loss_die", "late") / failures : 0;
      const sum = key => outcomes.reduce((value, outcome) => value + read(outcome, key), 0);
      measured += sum("forecast");
      total += winChance * ((1 - dieOnWin) * sum("victory") + dieOnWin * sum("victory_dead"))
        + (1 - winChance) * ((1 - lateFailure) * sum("failure") + lateFailure * sum("failure_late"));
    }
    return { attempted, measured, total: measured ? total : null, average: measured ? total / measured : null };
  }

  function money(value) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const rounded = Math.round(Number(value));
    return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}$${Math.abs(rounded).toLocaleString()}`;
  }

  function activeSubgroup(state, group) {
    const options = subgroups[group];
    if (!options) return null;
    const active = state.subgroups[group] || options[0][0];
    return options.find(([key]) => key === active) || options[0];
  }

  function focus(state, group, values) {
    if (!state.expanded[group] || !subgroups[group]) return values;
    return activeSubgroup(state, group)[2].map(index => values[index]).filter(value => value != null);
  }

  function cycle(state, group) {
    const options = subgroups[group];
    if (!options) return null;
    const active = activeSubgroup(state, group);
    const index = Math.max(0, options.findIndex(([key]) => key === active[0]));
    state.subgroups[group] = options[(index + 1) % options.length][0];
    return activeSubgroup(state, group);
  }

  function minimumWidths(state, group) {
    if (!state.expanded[group]) return [collapsedWidths[group] || 58];
    const widths = expandedWidths[group] || [];
    const subgroup = activeSubgroup(state, group);
    return subgroup ? subgroup[2].map(index => widths[index] || 58) : widths;
  }

  function normalizedSortValue(value, denominator = 1, scaled = false) {
    if (!scaled) return value;
    const numeric = Number(value), divisor = Number(denominator);
    return Number.isFinite(numeric) && Number.isFinite(divisor) && divisor > 0 ? numeric / divisor : null;
  }

  function compareSortValues(left, right, direction = "desc", leftIndex = 0, rightIndex = 0) {
    const leftMissing = left == null || (typeof left === "number" && !Number.isFinite(left));
    const rightMissing = right == null || (typeof right === "number" && !Number.isFinite(right));
    if (leftMissing || rightMissing) {
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      return leftIndex - rightIndex;
    }
    let comparison = typeof left === "string" || typeof right === "string"
      ? String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" })
      : Number(left) - Number(right);
    if (direction !== "asc") comparison *= -1;
    return comparison || leftIndex - rightIndex;
  }

  function appendGroupHeader({ topRow, detailRow, state, group, label, labels, collapsedLabel = "Total", rateLabel = (_group, value) => value, sortHeader, decorateDetail, onToggle, onCycle }) {
    const expanded = state.expanded[group];
    const focusedLabels = expanded ? focus(state, group, labels) : labels;
    const subgroup = expanded && activeSubgroup(state, group);
    const heading = element("th", null, `demo-toggle-heading ${group}-heading demo-group-start demo-group-end`);
    heading.colSpan = expanded ? focusedLabels.length : 1;
    heading.dataset.scoreboardHeader = group;
    const actions = element("div", null, "demo-column-heading-actions");
    const position = subgroup && group === "opening" ? ` · ${subgroups[group].indexOf(subgroup) + 1}/${subgroups[group].length}` : "";
    const toggle = element("button", `${subgroup?.[3] || label}${position} ${expanded ? "▾" : "▸"}`, "demo-column-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.addEventListener("click", () => onToggle(group));
    actions.appendChild(toggle);
    if (subgroup) {
      const options = subgroups[group];
      const index = options.findIndex(([key]) => key === subgroup[0]);
      const next = options[(index + 1) % options.length];
      const button = element("button", null, "demo-subgroup-shortcut");
      button.type = "button";
      button.dataset.scoreboardGroup = group;
      button.appendChild(element("span", "R"));
      button.title = `Press R or tap to switch to ${next[1]}`;
      button.setAttribute("aria-label", `${label} detail: ${subgroup[1]}. Press R or tap to switch to ${next[1]}`);
      button.addEventListener("click", () => onCycle(group, button));
      actions.appendChild(button);
    }
    heading.appendChild(actions);
    topRow.appendChild(heading);
    const details = (expanded ? focusedLabels : [collapsedLabel]).map(value => rateLabel(group, value, expanded));
    details.forEach((detail, index) => {
      const cell = element("th", null, `demo-group-detail ${group}-cell`);
      cell.scope = "col";
      if (index === 0) cell.classList.add("demo-group-start");
      if (index === details.length - 1) cell.classList.add("demo-group-end");
      const source = expanded ? focusedLabels[index] : collapsedLabel;
      if (flashDescriptions[source]) cell.title = flashDescriptions[source];
      decorateDetail?.(cell, detail);
      sortHeader(cell, detail, source, group);
      detailRow.appendChild(cell);
    });
  }

  function scrollGroupIntoView(wrap, table, group) {
    const header = table?.querySelector(`[data-scoreboard-header="${group}"]`);
    if (!wrap || !header || wrap.scrollWidth <= wrap.clientWidth) return null;
    const wrapRect = wrap.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const stickyInset = table.querySelector("thead th:first-child")?.offsetWidth || 0;
    const left = wrap.scrollLeft + headerRect.left - wrapRect.left;
    const right = left + headerRect.width;
    const visibleLeft = wrap.scrollLeft + stickyInset;
    const visibleRight = wrap.scrollLeft + wrap.clientWidth;
    let next = wrap.scrollLeft;
    if (headerRect.width > wrap.clientWidth - stickyInset || left < visibleLeft) next = left - stickyInset;
    else if (right > visibleRight) next = right - wrap.clientWidth;
    return Math.abs(next - wrap.scrollLeft) >= 0.5 ? next : null;
  }

  function renderControls({ target, state, defaultSections, valueModes, onSections, onValueMode, onUtilityBasis, modeNote }) {
    const sectionBar = element("div", null, "scoreboard-section-bar scoreboard-control-row");
    sectionBar.appendChild(element("strong", "Sections"));
    const sectionButtons = element("div", null, "scoreboard-button-group scoreboard-section-buttons");
    const preset = (text, values) => {
      const button = element("button", text, "scoreboard-preset-button");
      button.type = "button";
      button.addEventListener("click", () => onSections(new Set(values)));
      sectionButtons.appendChild(button);
    };
    preset("Default", defaultSections);
    preset("All", sections.map(([key]) => key));
    sections.forEach(([key, text, , style]) => {
      const active = state.visibleSections.has(key);
      const button = element("button", text, `scoreboard-section-button ${style}-heading${active ? " active" : ""}`);
      button.type = "button";
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", () => {
        const selected = new Set(state.visibleSections);
        if (selected.has(key)) selected.delete(key); else selected.add(key);
        onSections(selected);
      });
      sectionButtons.appendChild(button);
    });
    sectionBar.appendChild(sectionButtons);

    const mode = element("div", null, "scoreboard-value-toggle scoreboard-control-row");
    mode.appendChild(element("strong", "Values"));
    const modeButtons = element("div", null, "scoreboard-button-group");
    valueModes.forEach(([value, text]) => {
      const button = element("button", text, state.valueMode === value ? "active" : "");
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.valueMode === value));
      button.addEventListener("click", () => onValueMode(value));
      modeButtons.appendChild(button);
    });
    mode.appendChild(modeButtons);
    const utility = element("div", null, "scoreboard-utility-basis");
    utility.appendChild(element("span", "Utility yields"));
    const utilityButton = element("button", "Per grenade", state.perGrenadeUtility ? "active" : "");
    utilityButton.type = "button";
    utilityButton.disabled = state.valueMode === "totals";
    utilityButton.setAttribute("aria-pressed", String(state.perGrenadeUtility));
    utilityButton.title = "Use each relevant grenade type for damage, flash effects, and flash-assist yields";
    utilityButton.addEventListener("click", onUtilityBasis);
    utility.appendChild(utilityButton);
    mode.appendChild(utility);
    mode.appendChild(element("small", modeNote, "scoreboard-control-note"));
    target.replaceChildren(sectionBar, mode);
  }

  window.NickStatsScoreboard = {
    clutchEconomics, money, sections, groups, columns, subgroups, expandedWidths, collapsedWidths, groupSection,
    activeSubgroup, focus, cycle, minimumWidths, normalizedSortValue, compareSortValues,
    appendGroupHeader, scrollGroupIntoView, renderControls
  };
})();
