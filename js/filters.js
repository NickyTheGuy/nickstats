(() => {
  "use strict";

  const element = (tag, text = null, className = "") => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const defaultLabel = value => String(value || "Unknown").replace(/^de_/, "").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());

  class MultiMapFilter {
    constructor(targets, { onChange = () => {}, formatLabel = defaultLabel } = {}) {
      this.targets = (Array.isArray(targets) ? targets : [targets]).map(target => typeof target === "string" ? document.getElementById(target) : target).filter(Boolean);
      this.onChange = onChange;
      this.formatLabel = formatLabel;
      this.options = [];
      this.selected = new Set();
      document.addEventListener("click", event => {
        this.targets.forEach(target => {
          const menu = target.querySelector("details[open]");
          if (menu && !menu.contains(event.target)) menu.open = false;
        });
      });
      this.render();
    }

    get size() { return this.selected.size; }
    values() { return [...this.selected]; }
    matches(value) { return !this.selected.size || this.selected.has(value); }
    summary() {
      if (!this.selected.size) return "All maps";
      if (this.selected.size === 1) return this.formatLabel([...this.selected][0]);
      return `${this.selected.size} maps`;
    }
    setOptions(values, { reset = false } = {}) {
      const openTarget = this.targets.find(target => target.querySelector("details[open]")) || null;
      this.options = [...new Set(values.filter(Boolean))].sort();
      if (reset) this.selected.clear();
      else this.selected = new Set([...this.selected].filter(value => this.options.includes(value)));
      this.render(openTarget);
    }
    setSelected(values, { notify = false } = {}) {
      this.selected = new Set((values || []).filter(value => this.options.includes(value)));
      this.render();
      if (notify) this.onChange(this.values());
    }
    reset({ notify = false } = {}) {
      this.selected.clear(); this.render();
      if (notify) this.onChange(this.values());
    }
    render(openTarget = null) {
      this.targets.forEach(target => {
        const details = element("details", null, "map-filter-menu"); details.open = target === openTarget;
        details.appendChild(element("summary", this.summary()));
        const options = element("div", null, "map-filter-options");
        const addOption = (label, value) => {
          const row = element("label"), checkbox = element("input"), text = element("span", label);
          checkbox.type = "checkbox"; checkbox.value = value;
          checkbox.checked = value === "ALL" ? !this.selected.size : this.selected.has(value);
          checkbox.addEventListener("change", () => {
            if (value === "ALL") this.selected.clear();
            else if (checkbox.checked) this.selected.add(value); else this.selected.delete(value);
            this.render(target); this.onChange(this.values());
          });
          row.append(checkbox, text); options.appendChild(row);
        };
        addOption("All maps", "ALL");
        this.options.forEach(value => addOption(this.formatLabel(value), value));
        details.appendChild(options); target.replaceChildren(details);
      });
    }
  }

  function bindSegmentedToggle({ selector, valueFor, initial = "ALL", onChange = () => {} }) {
    const buttons = [...document.querySelectorAll(selector)];
    let value = initial;
    const set = (next, { notify = true } = {}) => {
      value = next;
      buttons.forEach(button => {
        const active = valueFor(button) === value;
        button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
      });
      if (notify) onChange(value);
    };
    buttons.forEach(button => button.addEventListener("click", () => set(valueFor(button))));
    set(initial, { notify: false });
    return { get value() { return value; }, set };
  }

  function matchResultMatches(result, filter) {
    return filter === "ALL" || result === filter;
  }

  function resultFilterLabel(filter) {
    return filter === "w" ? "Wins only" : filter === "l" ? "Losses only" : "All results";
  }

  function scoreBreakdown(rows, {
    resultFor = row => row.result,
    scoreFor = row => row.score_for,
    scoreAgainst = row => row.score_against
  } = {}) {
    const buckets = { wins: { count: 0, for: 0, against: 0 }, losses: { count: 0, for: 0, against: 0 } };
    for (const row of rows || []) {
      const bucket = resultFor(row) === "w" ? buckets.wins : resultFor(row) === "l" ? buckets.losses : null;
      const ownRaw = scoreFor(row), opponentRaw = scoreAgainst(row);
      const own = Number(ownRaw), opponent = Number(opponentRaw);
      if (!bucket || ownRaw == null || ownRaw === "" || opponentRaw == null || opponentRaw === "" ||
          !Number.isFinite(own) || !Number.isFinite(opponent)) continue;
      bucket.count += 1; bucket.for += own; bucket.against += opponent;
    }
    for (const bucket of Object.values(buckets)) {
      if (bucket.count) {
        bucket.for /= bucket.count; bucket.against /= bucket.count;
      }
      bucket.margin = bucket.for - bucket.against;
    }
    return buckets;
  }

  window.NickStatsFilters = Object.freeze({
    MultiMapFilter,
    bindSegmentedToggle,
    bindSideToggle: bindSegmentedToggle,
    matchResultMatches,
    resultFilterLabel,
    scoreBreakdown
  });
})();
