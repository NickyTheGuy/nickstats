(() => {
  "use strict";

  const number = value => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  };
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const signed = value => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(number(value)).toFixed(0)}`;

  function create({ prefix }) {
    const state = {
      map: "ALL",
      expandedGroups: { opening: false, clutches: false },
      sort: null,
      input: null
    };
    const byId = suffix => document.getElementById(`${prefix}Quick${suffix}`);
    const { integer, decimal, percent, titleCase } = window.NickStatsProfile;

    function mapsFor(players) {
      return [...new Set(players.flatMap(player => player.rows || []).map(row => row.map).filter(Boolean))]
        .sort((left, right) => titleCase(left.replace(/^de_/, "")).localeCompare(titleCase(right.replace(/^de_/, ""))));
    }

    function renderTable(comparison) {
      const clutchValue = (stats, statPrefix, size) => number(stats[`${statPrefix}_1v${size}`]);
      const clutchTotal = (stats, statPrefix) => [1, 2, 3, 4, 5].reduce((total, size) => total + clutchValue(stats, statPrefix, size), 0);
      const fixedColumns = [
        { key: "player", label: "Player", value: item => item.player.label, format: item => item.player.label },
        { key: "rounds", label: "Rounds", value: item => number(item.stats.rounds), format: item => integer(item.stats.rounds) },
        { key: "kda", label: "K / D / A", value: item => item.stats.kills, format: item => `${integer(item.stats.kills)} / ${integer(item.stats.deaths)} / ${integer(item.stats.assists)}` },
        { key: "kd", label: "K/D", value: item => item.stats.kd, format: item => decimal(item.stats.kd, 2) },
        { key: "adr", label: "ADR", value: item => item.stats.adr, format: item => decimal(item.stats.adr, 1) },
        { key: "rating", label: "Rating", value: item => item.stats.rating, format: item => decimal(item.stats.rating, 2), className: item => `demo-rating ${item.stats.rating >= 1.10 ? "rating-good" : item.stats.rating <= 0.90 ? "rating-bad" : "rating-average"}` },
        { key: "kast", label: "KAST", value: item => item.stats.kast, format: item => percent(item.stats.kast) }
      ];
      const openingColumns = state.expandedGroups.opening ? [
        { key: "opening-k", label: "K", value: item => number(item.stats.opening_kills), format: item => integer(item.stats.opening_kills) },
        { key: "opening-d", label: "D", value: item => number(item.stats.opening_deaths), format: item => integer(item.stats.opening_deaths) },
        { key: "opening-attempt", label: "Attempt rate", value: item => item.stats.openingAttemptRate, format: item => percent(item.stats.openingAttemptRate) },
        { key: "opening-diff", label: "Diff", value: item => item.stats.openingDiff, format: item => signed(item.stats.openingDiff) },
        { key: "opening-success", label: "Success", value: item => item.stats.openingSuccess, format: item => percent(item.stats.openingSuccess) }
      ] : [{
        key: "opening", label: "K-D · Att%", value: item => item.stats.openingDiff,
        format: item => `${integer(item.stats.opening_kills)}-${integer(item.stats.opening_deaths)} · ${percent(item.stats.openingAttemptRate)}`
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
      const segments = [
        { columns: fixedColumns },
        { group: "opening", label: "Opening", columns: openingColumns },
        { group: "clutches", label: "Clutches", columns: clutchColumns }
      ];
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
        const button = element("button", column.label, `player-table-sort-button${active ? " active" : ""}`);
        button.type = "button";
        if (active) button.dataset.direction = sort.direction;
        button.addEventListener("click", () => {
          state.sort = { key: column.key, direction: active ? (sort.direction === "asc" ? "desc" : "asc") : column.key === "player" ? "asc" : "desc" };
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
        toggle.addEventListener("click", () => { state.expandedGroups[segment.group] = !state.expandedGroups[segment.group]; state.sort = null; render(state.input); });
        heading.appendChild(toggle); top.appendChild(heading);
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
          cell.textContent = column.format(item);
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
      table.className = `player-profile-table quick-comparison-table${state.expandedGroups.opening ? " opening-expanded" : ""}${state.expandedGroups.clutches ? " clutches-expanded" : ""}`;
      table.style.minWidth = `${700 + openingColumns.length * 76 + clutchColumns.length * 62}px`;
      table.replaceChildren(head, body);
    }

    function render(input) {
      state.input = input;
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
      state.expandedGroups = { opening: false, clutches: false };
      state.sort = null;
      state.input = null;
    }

    return { render, reset };
  }

  window.NickStatsQuickComparison = { create };
})();
