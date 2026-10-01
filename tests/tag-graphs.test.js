"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
function api(store) {
  const context = { window: { NickStatsAvailability: { scope: stats => stats }, NickStatsManualFilters: { store } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8"), context);
  return context.window.NickStatsGraphs;
}
test("relationship buckets average each match once and keep empty buckets empty", () => {
  const graphs = api(), points = [{ value: 0, y: 1 }, { value: 4, y: 3 }, { value: 8, y: 10 }, { value: 12, y: 20 }];
  const buckets = graphs.relationshipBuckets(points, [0, 4, 6, 8, 12]);
  assert.deepEqual(Array.from(buckets, bucket => [bucket.count, bucket.value]), [[1, 1], [1, 3], [0, null], [2, 15]]);
  const overflow = graphs.relationshipBuckets(points, [-Infinity, 4, 8, Infinity]);
  assert.deepEqual(Array.from(overflow, bucket => bucket.count), [1, 1, 2]);
});
test("private numeric tags work on either axis and disappear when the account changes", () => {
  const store = { account: "nick", ready: true, filters: [{ id: "sleep", name: "Sleep", kind: "number" }],
    stateFor: (_, id) => ({ 1: 0, 2: 8.5, 3: "unknown" })[id] };
  const graphs = api(store); graphs.syncTagMetrics();
  const sleep = graphs.metrics.get("tag:sleep"), rating = graphs.metrics.get("rating");
  const series = { samples: [1, 2, 3].map(id => ({ id, stats: { rounds: 20, kills: id * 10, deaths: 10 } })) };
  const pairs = graphs.relationshipSamples(series, sleep, rating);
  assert.deepEqual(Array.from(pairs, point => point.value), [0, 8.5]);
  assert.equal(graphs.relationshipSamples(series, rating, sleep).length, 2);
  assert.ok(graphs.metricChoices("Tags", "sleep").length);
  store.account = null; graphs.syncTagMetrics();
  assert.equal(graphs.metrics.has("tag:sleep"), false);
});
