const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const worker = fs.readFileSync(path.join(__dirname, "../js/demo-worker.js"), "utf8");
const context = vm.createContext({ console, importScripts() {}, self: { addEventListener() {}, deademCs2: {}, postMessage() {} } });
vm.runInContext(worker, context);
// Build the sets inside the VM to match the freeze-end inventory snapshot.
const holder = (buy, equipment) => {
  context.sample = equipment;
  context.buy = buy;
  return vm.runInContext("heroHolder(sample.map(([value, weapons], row) => ({row, value, weapons: weapons && new Set(weapons)})), buy)", context);
};

test("a saved or dropped lone rifle is a hero on either low-buy category", () => {
  const players = [[3500, ["ak47", "glock"]], [900, ["deagle"]], [400, ["glock"]]];
  assert.equal(holder("force", players), 0);
  assert.equal(holder("eco", players), 0);
  assert.equal(holder("full", players), null);
});

test("two primary weapons, an SMG alone, or missing inventory cannot mark a hero", () => {
  assert.equal(holder("force", [[3500, ["awp"]], [1200, ["mp9"]]]), null);
  assert.equal(holder("force", [[3500, ["awp"]], [4000, ["ak47"]]]), null);
  assert.equal(holder("eco", [[2100, ["mac10"]], [200, ["glock"]]]), null);
  assert.equal(holder("force", [[3500, ["awp"]], [0, null]]), null);
});
