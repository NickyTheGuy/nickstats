"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "filters.js"), "utf8");
const context = { window: {}, document: { getElementById: () => null }, URLSearchParams };
vm.runInNewContext(source, context);
const { DateRangeFilter } = context.window.NickStatsFilters;

test("date range covers whole local days and excludes undated matches only while active", () => {
  const filter = new DateRangeFilter([]);
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
  const filter = new DateRangeFilter([]);
  filter.through = "2026-09-24";
  assert.equal(filter.matches(new Date(2020, 0, 1).getTime() / 1000), true);
  assert.equal(filter.matches(new Date(2026, 8, 25).getTime() / 1000), false);
  filter.through = "";
  filter.from = "2026-09-24";
  assert.equal(filter.matches(new Date(2020, 0, 1).getTime() / 1000), false);
  assert.equal(filter.matches(new Date(2030, 0, 1).getTime() / 1000), true);
});
