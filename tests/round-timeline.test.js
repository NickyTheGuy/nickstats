const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/round-timeline.js"), "utf8"), context);
const timeline = context.window.NickStatsRoundTimeline;
const played = (round, kills, side = "T") => ({ round, kills, side, buy: "full", opponent_buy: "eco", result: "win" });

test("exact numbered rounds average only appearances, including zero kills and a single overtime appearance", () => {
  const matches = Array.from({ length: 6 }, (_, index) => ({
    round_kills: [played(1, 1), played(2, index === 0 ? 2 : 0), ...(index === 0 ? [played(25, 1)] : [])]
  }));
  const points = timeline.averages(matches);
  assert.deepEqual(Array.from(points, point => [point.round, point.value, point.appearances]), [
    [1, 1, 6], [2, 1 / 3, 6], [25, 1, 1]
  ]);
  assert.deepEqual(Array.from(timeline.averages(matches, { phase: "OVERTIME" }), point => point.round), [25]);
  assert.deepEqual(Array.from(timeline.averages(matches, { side: "CT" })), []);
  matches[0].round_kills[2].hero = true;
  assert.deepEqual(Array.from(timeline.averages(matches, { phase: "OVERTIME", heroOnly: true }), point => [point.round, point.appearances]), [[25, 1]]);
});

test("match timeline reads kills, deaths, damage and AWP kills from one played round", () => {
  const slice = { stats: { kda: [2, 1, 0, 1, 143], weapons: [["awp", 1, 2, 89, 1, 1], ["ak47", 1, 2, 54, 1, 1]] } };
  assert.deepEqual(["kills", "deaths", "damage", "awp"].map(metric => timeline.metricValue(slice, metric)), [2, 1, 143, 1]);
});

test("round graph averages each available metric over played appearances without treating old payloads as zero", () => {
  const matches = [
    { round_kills: [{ round: 1, kills: 2, deaths: 1, damage: 120, awp_kills: 1 }, { round: 25, kills: 0, deaths: 1, damage: 0, awp_kills: 0 }] },
    { round_kills: [{ round: 1, kills: 0, deaths: 0, damage: 80, awp_kills: 0 }] },
    { round_kills: [{ round: 1, kills: 3 }] }
  ];
  assert.deepEqual(Array.from(timeline.averages(matches, {}, "deaths"), point => [point.round, point.value, point.appearances]), [[1, .5, 2], [25, 1, 1]]);
  assert.deepEqual(Array.from(timeline.averages(matches, {}, "damage"), point => [point.round, point.value, point.appearances]), [[1, 100, 2], [25, 0, 1]]);
  assert.deepEqual(Array.from(timeline.averages(matches, {}, "awp_kills"), point => [point.round, point.value, point.appearances]), [[1, .5, 2], [25, 0, 1]]);
});

test("match player timelines show running totals and keep regulation totals in overtime", () => {
  const slices = [
    { round: 1, side: "T", stats: { kda: [1, 0, 0, 0, 90] } },
    { round: 2, side: "T", stats: { kda: [0, 0, 0, 0, 0] } },
    { round: 3, side: "CT", stats: { kda: [2, 0, 0, 0, 140] } },
    { round: 25, side: "CT", stats: { kda: [1, 0, 0, 0, 65] } }
  ];
  const points = timeline.cumulativeValues(slices, "kills", {}, 25);
  assert.deepEqual([points[0].value, points[1].value, points[2].value, points[23].value, points[24].value], [1, 1, 3, 3, 4]);
  assert.equal(points[1].roundValue, 0);
  assert.deepEqual(Array.from(timeline.cumulativeValues(slices, "damage", { phase: "OVERTIME" }, 25), point => [point.round, point.value, point.roundValue]), [[25, 295, 65]]);
  assert.deepEqual(Array.from(timeline.cumulativeValues(slices, "kills", { side: "T", phase: "OVERTIME" }, 25), point => [point.round, point.value, point.roundValue]), [[25, 1, 0]]);
});

test("round differential follows the cumulative match score and averages only matches reaching each round", () => {
  const first = ["win", "win", "win", "loss", "loss", "loss", "win"].map((result, index) => ({ round: index + 1, result }));
  const second = ["loss", "win", "loss", "win"].map((result, index) => ({ round: index + 1, result }));
  const matches = [{ round_kills: timeline.withDifferentials(first) }, { round_kills: timeline.withDifferentials(second) }];
  assert.deepEqual(Array.from(matches[0].round_kills, row => row.differential), [1, 2, 3, 2, 1, 0, 1]);
  assert.deepEqual(Array.from(timeline.averages(matches, {}, "differential"), point => [point.round, point.value, point.appearances]), [
    [1, 0, 2], [2, 1, 2], [3, 1, 2], [4, 1, 2], [5, 1, 1], [6, 0, 1], [7, 1, 1]
  ]);
  assert.deepEqual(Array.from(timeline.withDifferentials([{ round: 1, result: "win" }, { round: 3, result: "win" }]), row => row.round), [1]);
});

test("match differential uses the chosen team across a side swap and retains the score in overtime", () => {
  const results = ["win", "win", "win", "loss", "loss", "loss", ...Array(18).fill("win"), "loss"];
  const payload = { rounds: 25, teams: [{ name: "Blue", players: [0] }, { name: "Gold", players: [1] }],
    players: [{ steam_id: "blue", round_slices: results.map((result, index) => ({ round: index + 1, result })) },
      { steam_id: "gold", round_slices: results.map((result, index) => ({ round: index + 1, result: result === "win" ? "loss" : "win" })) }] };
  const blue = timeline.matchDifferential(payload, "blue"), gold = timeline.matchDifferential(payload, "gold");
  assert.deepEqual([blue.points[3].forScore, blue.points[3].againstScore, blue.points[3].value], [3, 1, 2]);
  assert.equal(blue.points[5].value, 0);
  assert.equal(blue.points[24].value, 17);
  assert.equal(gold.points[24].value, -17);
});

test("match timelines draw differential and selected player statistics as graphs", () => {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener() {}
  }
  context.document = { createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag) };
  context.window.NickStatsAvailability = { scope: stats => stats };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8"), context);
  const target = new Node("div");
  const payload = { rounds: 25, teams: [{ name: "Blue", players: [0] }], players: [
    { steam_id: "blue", round_slices: Array.from({ length: 25 }, (_, index) => ({ round: index + 1, result: index < 13 ? "win" : "loss" })) }
  ] };
  timeline.render(target, payload, "differential", { phase: "OVERTIME" }, "blue");
  const svg = target.children[0].children[0];
  assert.equal(svg.tag, "svg");
  assert.equal(svg.children.filter(child => child.tag === "circle").length, 1);
  assert.match(svg.children.find(child => child.tag === "circle").attributes["aria-label"], /Round 25: \+1 · 13–12 · round lost/);
  const playerPayload = { rounds: 2, teams: [{ players: [0, 1] }], players: [
    { name: "Blue", round_slices: [{ round: 1, stats: { kda: [2, 1, 0, 0, 120] } }, { round: 2, stats: { kda: [0, 0, 0, 0, 0] } }] },
    { name: "Gold", round_slices: [{ round: 1, stats: { kda: [1, 0, 0, 0, 90] } }] }
  ] };
  timeline.render(target, playerPayload, "kills", {}, null, new Set([0]), "line");
  assert.equal(target.children[0].children[0].children.filter(child => child.tag === "circle").length, 2);
  assert.match(target.children[0].children[0].children.filter(child => child.tag === "circle")[1].attributes["aria-label"], /Round 2: 2 kills total · 0 this round/);
  timeline.render(target, playerPayload, "damage", {}, null, new Set([0, 1]), "bars");
  assert.equal(target.children[0].children[0].children.filter(child => child.tag === "rect" && child.attributes.class === "graph-series-bar").length, 4);
});
