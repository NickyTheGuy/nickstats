// Calendar days are interpreted in the viewer's timezone. The API's upper bound is exclusive.
export function localDay(value, next = false) {
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

export class DateRangeStore {
  static instances = new Set();
  static earliest = "";
  static setEarliest(timestamp) {
    const value = Number(timestamp);
    const earliest = Number.isFinite(value) && value > 0 ? dayString(new Date(value * 1000)) : "";
    if (earliest === this.earliest) return;
    this.earliest = earliest;
    this.instances.forEach(filter => filter.render());
  }

  constructor({ onChange = () => {} } = {}) {
    this.onChange = onChange;
    this.from = ""; this.through = "";
    this.draftFrom = ""; this.draftThrough = "";
    this.calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
    this.secondMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    this.openTarget = null;
    this.listeners = new Set();
    this.subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    this.getSnapshot = () => this.snapshot;
    DateRangeStore.instances.add(this);
    this.render();
  }
  open(target) {
    this.openTarget = target;
    this.draftFrom = this.from; this.draftThrough = this.through;
    const focus = localDay(this.draftFrom) || new Date();
    this.calendarMonth = new Date(focus.getFullYear(), focus.getMonth() - 1, 1);
    this.secondMonth = new Date(focus.getFullYear(), focus.getMonth(), 1);
    this.render();
  }
  apply() {
    if (!this.draftFrom || !this.draftThrough) return;
    this.from = this.draftFrom; this.through = this.draftThrough;
    this.closeMenus(); this.onChange();
  }
  destroy() { DateRangeStore.instances.delete(this); this.listeners.clear(); }
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
  closeMenus() { this.openTarget = null; this.render(); }
  get minimumMonth() { return (DateRangeStore.earliest || "2000-01-01").slice(0, 7); }
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
    if (!localDay(value) || value > this.today || (DateRangeStore.earliest && value < DateRangeStore.earliest)) return;
    if (!this.draftFrom || this.draftThrough || value < this.draftFrom) {
      this.draftFrom = value; this.draftThrough = "";
    } else this.draftThrough = value;
    this.renderPanel();
  }
  calendarFor(month, index = 0) {
    const limits = this.monthLimits(index);
    const months = [];
    for (let date = localDay(`${limits.min}-01`); monthString(date) <= limits.max; date.setMonth(date.getMonth() + 1)) {
      months.push([monthString(date), date.toLocaleDateString(undefined, { month: "long", year: "numeric" })]);
    }
    const days = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, offset) => {
      const date = new Date(month.getFullYear(), month.getMonth(), offset + 1), value = dayString(date);
      return { value, day: offset + 1,
        label: date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
        disabled: value > this.today || Boolean(DateRangeStore.earliest && value < DateRangeStore.earliest),
        selected: value === this.draftFrom || value === this.draftThrough,
        withinRange: Boolean(this.draftFrom && this.draftThrough && value > this.draftFrom && value < this.draftThrough) };
    });
    return { index, value: monthString(month), months, days, offset: month.getDay(),
      previousDisabled: monthString(month) <= limits.min, nextDisabled: monthString(month) >= limits.max };
  }
  renderPanel() { this.render(); }
  render() {
    this.normalizeMonths();
    this.snapshot = { from: this.from, through: this.through, draftFrom: this.draftFrom, draftThrough: this.draftThrough,
      openTarget: this.openTarget, summary: this.summary(),
      calendars: [this.calendarFor(this.calendarMonth, 0), ...(this.secondMonth ? [this.calendarFor(this.secondMonth, 1)] : [])] };
    this.listeners.forEach(listener => listener());
  }
}
