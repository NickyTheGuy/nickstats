"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const workerPath = path.join(__dirname, "..", "js", "demo-worker.js");
const source = fs.readFileSync(workerPath, "utf8");

function workerContext() {
  const context = vm.createContext({
    console,
    importScripts() {},
    self: { addEventListener() {}, deademCs2: {}, postMessage() {} }
  });
  vm.runInContext(source, context, { filename: workerPath });
  return context;
}

test("M4 item definitions override ambiguous family labels", () => {
  const context = workerContext();
  const result = vm.runInContext(`(() => {
    const pistols = new Map(), rifles = new Map(), player = {};
    return [
      itemEventWeapon(pistols, rifles, player, { defindex: 60, item: "m4a1" }),
      rifles.get(player),
      itemEventWeapon(pistols, rifles, player, { defindex: 16, item: "m4a1_silencer" }),
      rifles.get(player)
    ];
  })()`, context);
  assert.deepEqual(Array.from(result), ["m4a1_silencer", "m4a1_silencer", "m4a1", "m4a1"]);
});

test("combat events retain an explicitly learned M4A1-S choice", () => {
  assert.match(source, /if \(id === "m4a1_silencer"\)[\s\S]*?ctRifleChoice\.set\(row, "m4a1_silencer"\)/);
  assert.match(source, /if \(id === "m4a1"\) return ctRifleChoice\.get\(row\) \|\| "m4a1";/);
  assert.match(source, /weapon === "m4a1" \|\| weapon === "m4a1_silencer"/);
});
