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

  // Calendar days are interpreted in the viewer's timezone. The API's upper bound is exclusive.
  function localDay(value, next = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    if (next) date.setDate(date.getDate() + 1);
    return date;
  }

  class DateRangeFilter {
    constructor(targets, { onChange = () => {} } = {}) {
      this.targets = (Array.isArray(targets) ? targets : [targets]).map(target => typeof target === "string" ? document.getElementById(target) : target).filter(Boolean);
      this.onChange = onChange;
      this.from = "";
      this.through = "";
      this.targets.forEach(target => {
        const field = (text, key) => {
          const label = element("label", null, "date-range-field");
          label.appendChild(element("span", text));
          const input = element("input"); input.type = "date"; input.setAttribute("aria-label", `${text} date`);
          input.addEventListener("change", () => {
            this[key] = input.value;
            if (this.from && this.through && this.from > this.through) {
              if (key === "from") this.through = this.from;
              else this.from = this.through;
            }
            this.render(); this.onChange();
          });
          label.appendChild(input); target.appendChild(label);
        };
        field("From", "from"); field("Through", "through");
        const clear = element("button", "Clear dates", "date-range-clear"); clear.type = "button";
        clear.addEventListener("click", () => this.reset({ notify: true }));
        target.appendChild(clear);
      });
      this.render();
    }
    get active() { return Boolean(this.from || this.through); }
    get bounds() {
      return { from: localDay(this.from)?.getTime() ?? null, to: localDay(this.through, true)?.getTime() ?? null };
    }
    matches(timestamp) {
      if (!this.active) return true;
      if (timestamp == null || timestamp === "") return false;
      const value = Number(timestamp);
      if (!Number.isFinite(value) || value <= 0) return false;
      const { from, to } = this.bounds;
      const milliseconds = value * 1000;
      return (from == null || milliseconds >= from) && (to == null || milliseconds < to);
    }
    appendQuery(parameters) {
      const { from, to } = this.bounds;
      if (from != null) parameters.set("from", new Date(from).toISOString().replace(".000Z", "Z"));
      if (to != null) parameters.set("to", new Date(to).toISOString().replace(".000Z", "Z"));
    }
    summary() { return this.active ? `${this.from || "Any day"} to ${this.through || "Any day"}` : "All dates"; }
    reset({ notify = false } = {}) { this.from = ""; this.through = ""; this.render(); if (notify) this.onChange(); }
    render() {
      this.targets.forEach(target => {
        const inputs = target.querySelectorAll('input[type="date"]');
        inputs[0].value = this.from; inputs[1].value = this.through;
        target.querySelector("button").hidden = !this.active;
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
    DateRangeFilter,
    bindSegmentedToggle,
    bindSideToggle: bindSegmentedToggle,
    matchResultMatches,
    resultFilterLabel,
    scoreBreakdown
  });
})();
