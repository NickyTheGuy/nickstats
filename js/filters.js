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

  const dayString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const monthString = date => dayString(date).slice(0, 7);
  const displayDay = value => localDay(value)?.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" }) || "Any day";

  class DateRangeFilter {
    static instances = new Set();
    static earliest = "";
    static setEarliest(timestamp) {
      const value = Number(timestamp);
      this.earliest = Number.isFinite(value) && value > 0 ? dayString(new Date(value * 1000)) : "";
      this.instances.forEach(filter => filter.render());
    }

    constructor(targets, { onChange = () => {} } = {}) {
      this.targets = (Array.isArray(targets) ? targets : [targets]).map(target => typeof target === "string" ? document.getElementById(target) : target).filter(Boolean);
      this.onChange = onChange;
      this.from = "";
      this.through = "";
      this.draftFrom = "";
      this.draftThrough = "";
      this.calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      this.secondMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      DateRangeFilter.instances.add(this);
      this.targets.forEach(target => {
        const menu = element("details", null, "date-range-menu");
        const trigger = element("summary"); menu.appendChild(trigger);
        const panel = element("div", null, "date-range-panel");
        panel.appendChild(element("p", "Choose a start and end date. Click the same date twice for one day.", "date-range-help"));
        panel.appendChild(element("p", "", "date-range-selection"));
        panel.appendChild(element("div", null, "date-range-calendars"));
        const actions = element("div", null, "date-range-actions");
        const clear = element("button", "Clear", "date-range-clear"); clear.type = "button";
        clear.addEventListener("click", () => { this.reset({ notify: true }); this.closeMenus(); });
        const apply = element("button", "Apply range", "date-range-apply"); apply.type = "button";
        apply.addEventListener("click", () => {
          if (apply.disabled) return;
          this.from = this.draftFrom; this.through = this.draftThrough;
          this.closeMenus(); this.render(); this.onChange();
        });
        actions.append(clear, apply); panel.appendChild(actions); menu.appendChild(panel);
        target.replaceChildren(element("span", "Dates", "date-range-label"), menu);
        menu.addEventListener("toggle", () => {
          if (!menu.open) return;
          this.closeMenus(menu);
          this.draftFrom = this.from; this.draftThrough = this.through;
          const focusDay = localDay(this.draftFrom) || new Date();
          const firstMonth = new Date(focusDay.getFullYear(), focusDay.getMonth() - 1, 1);
          const earliest = localDay(DateRangeFilter.earliest);
          const minimum = earliest && new Date(earliest.getFullYear(), earliest.getMonth(), 1);
          this.calendarMonth = minimum && firstMonth < minimum ? minimum : firstMonth;
          this.secondMonth = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + 1, 1);
          this.renderPanel();
        });
      });
      if (this.targets.length) document.addEventListener("click", event => {
        if (!this.targets.some(target => target.contains(event.target))) this.closeMenus();
      });
      this.render();
    }
    get today() { return dayString(new Date()); }
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
    summary() { return this.active ? `${displayDay(this.from)} to ${displayDay(this.through)}` : "All dates"; }
    reset({ notify = false } = {}) {
      this.from = ""; this.through = ""; this.draftFrom = ""; this.draftThrough = "";
      this.render(); if (notify) this.onChange();
    }
    closeMenus(except = null) {
      this.targets.forEach(target => { const menu = target.querySelector("details"); if (menu !== except) menu.open = false; });
    }
    get minimumMonth() { return (DateRangeFilter.earliest || "2000-01-01").slice(0, 7); }
    get hasSecondMonth() { return this.minimumMonth < this.today.slice(0, 7); }
    normalizeMonths() {
      const today = this.today.slice(0, 7);
      if (monthString(this.calendarMonth) < this.minimumMonth) this.calendarMonth = localDay(`${this.minimumMonth}-01`);
      if (monthString(this.calendarMonth) > today || (this.hasSecondMonth && monthString(this.calendarMonth) === today)) {
        this.calendarMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - (this.hasSecondMonth ? 2 : 1), 1);
      }
      if (this.hasSecondMonth) {
        const next = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + 1, 1);
        if (!this.secondMonth || monthString(this.secondMonth) < monthString(next) || monthString(this.secondMonth) > today) this.secondMonth = next;
      } else this.secondMonth = null;
    }
    monthLimits(index) {
      if (index === 1) return { min: monthString(new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + 1, 1)), max: this.today.slice(0, 7) };
      return { min: this.minimumMonth, max: this.secondMonth
        ? monthString(new Date(this.secondMonth.getFullYear(), this.secondMonth.getMonth() - 1, 1)) : this.today.slice(0, 7) };
    }
    setCalendarMonth(index, value) {
      const { min, max } = this.monthLimits(index);
      if (value < min || value > max) return;
      const selected = localDay(`${value}-01`);
      if (!selected) return;
      if (index === 0) this.calendarMonth = selected; else this.secondMonth = selected;
      this.renderPanel();
    }
    moveCalendar(index, amount) {
      const month = index === 0 ? this.calendarMonth : this.secondMonth;
      if (month) this.setCalendarMonth(index, monthString(new Date(month.getFullYear(), month.getMonth() + amount, 1)));
    }
    moveMonth(amount) {
      this.moveCalendar(0, amount);
    }
    selectDay(value) {
      if (!localDay(value) || value > this.today || (DateRangeFilter.earliest && value < DateRangeFilter.earliest)) return;
      if (!this.draftFrom || this.draftThrough || value < this.draftFrom) {
        this.draftFrom = value; this.draftThrough = "";
      } else this.draftThrough = value;
      this.renderPanel();
      this.targets.forEach(target => target.querySelector(`.date-range-day[data-date="${value}"]`)?.focus({ preventScroll: true }));
    }
    calendarFor(month, index = 0) {
      const calendar = element("div", null, "date-range-calendar");
      const navigation = element("div", null, "date-range-navigation");
      const { min, max } = this.monthLimits(index);
      const previous = element("button", "‹", "date-range-previous"); previous.type = "button";
      previous.disabled = monthString(month) <= min; previous.setAttribute("aria-label", `Previous month for calendar ${index + 1}`);
      previous.addEventListener("click", event => { event.stopPropagation(); this.moveCalendar(index, -1); });
      const jump = element("select", null, "date-range-jump"); jump.setAttribute("aria-label", `Month for calendar ${index + 1}`);
      for (let date = localDay(`${min}-01`); monthString(date) <= max; date.setMonth(date.getMonth() + 1)) {
        const option = element("option", date.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
        option.value = monthString(date); jump.appendChild(option);
      }
      jump.value = monthString(month);
      jump.addEventListener("click", event => event.stopPropagation());
      jump.addEventListener("change", () => this.setCalendarMonth(index, jump.value));
      const next = element("button", "›", "date-range-next"); next.type = "button";
      next.disabled = monthString(month) >= max; next.setAttribute("aria-label", `Next month for calendar ${index + 1}`);
      next.addEventListener("click", event => { event.stopPropagation(); this.moveCalendar(index, 1); });
      navigation.append(previous, jump, next); calendar.appendChild(navigation);
      window.NickStatsDropdown?.enhance(jump);
      const grid = element("div", null, "date-range-grid");
      for (const weekday of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) grid.appendChild(element("span", weekday, "date-range-weekday"));
      for (let offset = 0; offset < month.getDay(); offset += 1) grid.appendChild(element("span"));
      const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        const date = new Date(month.getFullYear(), month.getMonth(), day), value = dayString(date);
        const button = element("button", String(day), "date-range-day"); button.type = "button";
        button.dataset.date = value;
        button.disabled = value > this.today || Boolean(DateRangeFilter.earliest && value < DateRangeFilter.earliest);
        button.setAttribute("aria-label", date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
        button.classList.toggle("selected", value === this.draftFrom || value === this.draftThrough);
        button.classList.toggle("within-range", Boolean(this.draftFrom && this.draftThrough && value > this.draftFrom && value < this.draftThrough));
        // The button is replaced during renderPanel. Without stopping this click,
        // the document's outside-click handler sees a detached target and closes the menu.
        button.addEventListener("click", event => { event.stopPropagation(); this.selectDay(value); }); grid.appendChild(button);
      }
      calendar.appendChild(grid); return calendar;
    }
    renderPanel() {
      this.normalizeMonths();
      this.targets.forEach(target => {
        const panel = target.querySelector(".date-range-panel");
        const calendars = [this.calendarFor(this.calendarMonth, 0)];
        if (this.secondMonth) calendars.push(this.calendarFor(this.secondMonth, 1));
        const grid = panel.querySelector(".date-range-calendars");
        grid.classList.toggle("single-month", !this.secondMonth);
        grid.replaceChildren(...calendars);
        panel.querySelector(".date-range-selection").textContent = this.draftFrom
          ? this.draftThrough ? `${displayDay(this.draftFrom)} through ${displayDay(this.draftThrough)}` : `Start: ${displayDay(this.draftFrom)} · Choose an end date`
          : "Choose a start date";
        panel.querySelector(".date-range-apply").disabled = !this.draftFrom || !this.draftThrough;
      });
    }
    render() {
      this.targets.forEach(target => {
        target.querySelector("summary").textContent = this.active ? this.summary() : "All dates";
      });
      this.renderPanel();
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
