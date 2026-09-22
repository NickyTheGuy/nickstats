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
    ["trades", "Trades", ["trades"], "trades"], ["rounds", "Rounds", ["clutches", "multikills", "objectives"], "rounds"],
    ["roundState", "Round state", ["roundState", "killStage", "timing"], "roundState"],
    ["context", "Context", ["killContext"], "killContext"], ["movement", "Movement", ["movement"], "movement"],
    ["utility", "Utility", ["utility"], "utility"]
  ]);
  const groups = Object.freeze([
    ["combat", "Overview"], ["opening", "Opening"], ["trades", "Trades"], ["clutches", "Clutches"],
    ["multikills", "Kill rounds"], ["objectives", "Objectives"], ["roundState", "Man count"],
    ["killStage", "Kill stage"], ["timing", "Round timing"], ["killContext", "Context"],
    ["movement", "Movement"], ["utility", "Utility"]
  ]);
  const columns = Object.freeze({
    combat: [["K", "D", "A", "K/D", "HS%", "Damage", "Received", "Diff", "ADR"], "K-D-A"],
    opening: [["K", "D", "Assisted K", "Dmg A", "Flash A", "Traded D", "Trade K", "A earned", "Dmg A earned", "Flash A earned", "Enemy blind K", "Blind K", "Blind D", "Blind killer D", "Enemy assisted D", "Enemy dmg A D", "Enemy flash A D", "Own flash K", "Victim-side flash K", "Unknown flash K", "Killer flash D", "Own-side flash D", "Unknown flash D", "Attempt rate", "Diff", "Success", "Assist %"], "K-D · Att%"],
    trades: [["K Opp", "K Att", "K (Succ%)", "D Opp", "D Att", "D (Succ%)"], "K-D"],
    clutches: [["1v5", "1v4", "1v3", "1v2", "1v1"], "Total W/A"],
    multikills: [["5K", "4K", "3K", "2K", "1K", "Multi%", "5K", "4K", "3K", "2K", "TMK%"], "Total"],
    objectives: [["Plants", "Defuses"], "Plants/defuses"],
    roundState: [["Clawback-Bozo K-D", "Even K-D", "Advantage K / Outnumbered D", "Cleanup K-D"], "Clawback-Bozo K-D"],
    killStage: [["5 alive K-D", "4 alive K-D", "3 alive K-D", "2 alive K-D", "1 alive K-D"], "5/1 alive K"],
    timing: [["Avg kill", "Avg death", "Early K-D", "Mid K-D", "Late K-D", "Post-plant K-D"], "Avg K/D time"],
    killContext: [["Enemy blind K-D", "Killer blind K-D", "Wallbang K-D", "Smoke K-D", "Air K-D", "Grenade out K-D", "Knife out K-D", "Paul K-D", "Run K-D"], "Bullshit K-D"],
    movement: [["Move K-D", "Still K-D", "Run K-D", "Air K-D", "Kill speed avg/max", "Kill speed avg/peak %", "Enemy speed avg/max", "Enemy speed avg/peak %"], "Move/run/air"],
    utility: [["HE Dmg", "Fire Dmg", "HE thrown", "Flash thrown", "Smoke thrown", "Fire thrown", "Decoy thrown", "EF", "Enemy sec", "TF", "Teammate sec", "SF", "Self sec", "FA", "Damage assist", "Teammate flash", "Own flash"], "Damage · thrown"]
  });
  const subgroups = Object.freeze({
    combat: [["output", "Output", [0, 1, 2, 3, 4], "Overview"], ["damage", "Damage", [5, 6, 7, 8], "Damage"]],
    opening: [["results", "Results", [0, 1, 23, 24, 25], "Opening results"], ["received", "Help received", [2, 3, 4, 5, 26], "Opening help received"], ["given", "Help given", [6, 7, 8, 9], "Opening help given"], ["flash", "Flash context", [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], "Opening flash context"]],
    multikills: [["regular", "Regular", [0, 1, 2, 3, 4, 5], "Multi-kills"], ["true", "True", [6, 7, 8, 9, 10], "True multi-kills"]],
    killContext: [["visibility", "Visibility and cover", [0, 1, 2, 3, 4], "Visibility and cover"], ["readiness", "Readiness", [5, 6, 7, 8], "Readiness"]],
    movement: [["state", "State", [0, 1, 2, 3], "Movement"], ["speed", "Speed", [4, 5, 6, 7], "Movement speed"]],
    utility: [["damage", "Damage", [0, 1], "Utility damage"], ["usage", "Usage", [2, 3, 4, 5, 6], "Utility usage"], ["flashes", "Flash effects", [7, 8, 9, 10, 11, 12, 13], "Flash effects"], ["assists", "Assisted kills", [14, 15, 16], "Utility assisted kills"]]
  });
  const expandedWidths = Object.freeze({
    combat: [54, 54, 54, 62, 62, 82, 88, 76, 72],
    opening: [58, 58, 82, 68, 72, 88, 68, 76, 76, 84, 82, 68, 68, 92, 104, 112, 112, 88, 120, 102, 92, 120, 110, 82, 62, 72, 76],
    trades: [58, 54, 96, 58, 54, 96], clutches: [55, 55, 55, 55, 55],
    multikills: [55, 55, 55, 55, 55, 72, 55, 55, 55, 55, 72], objectives: [74, 74],
    roundState: [128, 88, 168, 104], killStage: [92, 92, 92, 92, 92], timing: [82, 82, 84, 84, 84, 112],
    killContext: [104, 104, 98, 88, 88, 112, 104, 88, 88], movement: [88, 88, 88, 88, 116, 132, 126, 142],
    utility: [82, 82, 86, 94, 94, 94, 94, 58, 92, 58, 112, 58, 86, 58, 100, 112, 90]
  });
  const collapsedWidths = Object.freeze({
    combat: 90, opening: 108, trades: 88, clutches: 82, multikills: 92, objectives: 128,
    roundState: 112, killStage: 104, timing: 110, killContext: 112, movement: 112, utility: 176
  });
  const groupSection = Object.freeze(Object.fromEntries(sections.flatMap(([section, , values]) => values.map(group => [group, section]))));

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

  function appendGroupHeader({ topRow, detailRow, state, group, label, labels, collapsedLabel = "Total", rateLabel = (_group, value) => value, sortHeader, decorateDetail, onToggle, onCycle }) {
    const expanded = state.expanded[group];
    const focusedLabels = expanded ? focus(state, group, labels) : labels;
    const subgroup = expanded && activeSubgroup(state, group);
    const heading = element("th", null, `demo-toggle-heading ${group}-heading demo-group-start demo-group-end`);
    heading.colSpan = expanded ? focusedLabels.length : 1;
    heading.dataset.scoreboardHeader = group;
    const actions = element("div", null, "demo-column-heading-actions");
    const toggle = element("button", `${subgroup?.[3] || label} ${expanded ? "▾" : "▸"}`, "demo-column-toggle");
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
      decorateDetail?.(cell, detail);
      const source = expanded ? focusedLabels[index] : collapsedLabel;
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
    sections, groups, columns, subgroups, expandedWidths, collapsedWidths, groupSection,
    activeSubgroup, focus, cycle, minimumWidths, appendGroupHeader, scrollGroupIntoView, renderControls
  };
})();
