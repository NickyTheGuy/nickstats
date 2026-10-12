"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

let DateRangeFilter;
test.before(async () => { ({ DateRangeStore: DateRangeFilter } = await import('../frontend/state/date-range.mjs')); });

test("date range covers whole local days and excludes undated matches only while active", () => {
  const filter = new DateRangeFilter();
  assert.equal(filter.matches(null), true);
  filter.from = "2026-09-24";
  filter.through = "2026-09-24";
  const start = new Date(2026, 8, 24).getTime() / 1000;
  const next = new Date(2026, 8, 25).getTime() / 1000;
  assert.equal(filter.matches(start - 1), false);
  assert.equal(filter.matches(start), true);
  assert.equal(filter.matches(next - 1), true);
  assert.equal(filter.matches(next), false);
  assert.equal(filter.matches(null), false);
  assert.equal(filter.matches(0), false);
  const query = new URLSearchParams(); filter.appendQuery(query);
  assert.equal(query.get("from"), new Date(start * 1000).toISOString().replace(".000Z", "Z"));
  assert.equal(query.get("to"), new Date(next * 1000).toISOString().replace(".000Z", "Z"));
  filter.reset();
  assert.equal(filter.matches(null), true);
});

test("single-ended date ranges do not discard matches on the open side", () => {
  const filter = new DateRangeFilter();
  filter.through = "2026-09-24";
  assert.equal(filter.matches(new Date(2020, 0, 1).getTime() / 1000), true);
  assert.equal(filter.matches(new Date(2026, 8, 25).getTime() / 1000), false);
  filter.through = "";
  filter.from = "2026-09-24";
  assert.equal(filter.matches(new Date(2020, 0, 1).getTime() / 1000), false);
  assert.equal(filter.matches(new Date(2030, 0, 1).getTime() / 1000), true);
});

test("database minimum follows the earliest match in the viewer's local calendar", () => {
  const earliest = new Date(2020, 5, 17, 23, 30).getTime() / 1000;
  DateRangeFilter.setEarliest(earliest);
  assert.equal(DateRangeFilter.earliest, "2020-06-17");
  const filter = new DateRangeFilter();
  filter.calendarMonth = new Date(2020, 5, 1);
  filter.moveMonth(-1);
  assert.equal(filter.calendarMonth.getMonth(), 5);
  filter.calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  filter.moveMonth(1);
  assert.equal(filter.calendarMonth.getMonth(), new Date().getMonth());
  DateRangeFilter.setEarliest(null);
  assert.equal(DateRangeFilter.earliest, "");
});

test("calendar clicks choose one inclusive range before applying it", () => {
  const filter = new DateRangeFilter();
  filter.selectDay("2026-09-10");
  assert.equal(filter.draftFrom, "2026-09-10");
  assert.equal(filter.draftThrough, "");
  assert.equal(filter.active, false);
  filter.selectDay("2026-09-14");
  assert.equal(filter.draftThrough, "2026-09-14");
  filter.selectDay("2026-09-08");
  assert.equal(filter.draftFrom, "2026-09-08");
  assert.equal(filter.draftThrough, "");
});

test("draft date selection leaves committed bounds unchanged until Apply", () => {
  let notified = 0;
  const filter = new DateRangeFilter({ onChange: () => notified++ });
  filter.open(0); filter.selectDay("2026-09-10"); filter.selectDay("2026-09-10");
  assert.equal(filter.active, false); assert.equal(notified, 0);
  filter.apply(); assert.equal(filter.from, "2026-09-10"); assert.equal(filter.through, "2026-09-10");
  assert.equal(filter.openTarget, null); assert.equal(notified, 1);
  filter.open(1); filter.selectDay("2026-09-11"); filter.closeMenus(); filter.open(0);
  assert.equal(filter.draftFrom, filter.from); assert.equal(filter.draftThrough, filter.through);
  filter.destroy();
});

test("each calendar navigates independently and a range can cross months", () => {
  const earliest = new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1);
  DateRangeFilter.setEarliest(earliest.getTime() / 1000);
  const filter = new DateRangeFilter();
  const first = filter.getSnapshot().calendars[0], second = filter.getSnapshot().calendars[1];
  assert.ok(first.months.length); assert.ok(second.months.length);
  filter.selectDay(first.days.find(day => !day.disabled).value);
  filter.selectDay(second.days.find(day => !day.disabled).value);
  assert.equal(filter.draftFrom.slice(0,7), first.value); assert.equal(filter.draftThrough.slice(0,7), second.value);
  const rightMonth = filter.secondMonth;
  filter.moveCalendar(0,-1); assert.equal(filter.secondMonth, rightMonth);
  assert.equal(filter.calendarMonth.getMonth(), earliest.getMonth());
  DateRangeFilter.setEarliest(null); filter.destroy();
});

test("earliest date refresh updates calendar snapshots and supports one month", () => {
  const filter = new DateRangeFilter(); let calls = 0;
  const off = filter.subscribe(() => calls++), previous = filter.getSnapshot();
  const today = new Date(); DateRangeFilter.setEarliest(new Date(today.getFullYear(), today.getMonth(), 1).getTime()/1000);
  assert.equal(filter.getSnapshot().calendars.length,1);
  assert.notEqual(filter.getSnapshot(),previous); assert.equal(calls,1);
  off(); filter.reset(); assert.equal(calls,1);
  DateRangeFilter.setEarliest(null); filter.destroy();
});

test("date summaries use the viewer's local date format", () => {
  const filter = new DateRangeFilter();
  filter.from = "2026-09-10"; filter.through = "2026-09-24";
  const expected = new Date(2026, 8, 10).toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
  assert.ok(filter.summary().startsWith(`${expected} to `));
  assert.equal(filter.summary().includes("2026-09-10"), false);
});
