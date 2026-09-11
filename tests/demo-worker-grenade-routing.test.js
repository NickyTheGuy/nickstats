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
    self: {
      addEventListener() {},
      deademCs2: {},
      postMessage() {}
    }
  });
  vm.runInContext(source, context, { filename: workerPath });
  return context;
}

test("grenade weapon names map to their thrown-stat fields", () => {
  const context = workerContext();
  const cases = {
    weapon_hegrenade: "heGrenadesThrown",
    flashbang: "flashbangsThrown",
    weapon_smokegrenade: "smokesThrown",
    molotov: "fireGrenadesThrown",
    weapon_incgrenade: "fireGrenadesThrown",
    decoy: "decoysThrown",
    weapon_ak47: null
  };
  for (const [weapon, expected] of Object.entries(cases)) {
    assert.equal(vm.runInContext(`grenadeThrowStatField(${JSON.stringify(weapon)})`, context), expected);
  }
});

test("weapon_fire routes through both weapon and grenade accounting", () => {
  assert.match(source, /case "weapon_fire":[\s\S]*?handleWeaponFire\(gameEvent\);[\s\S]*?handleGrenadeThrown\(gameEvent\);/);
  assert.doesNotMatch(source, /case "grenade_thrown":/);
});
