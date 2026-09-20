"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "demo.js"), "utf8");

test("the demo picker accepts and displays a multi-file queue", () => {
  assert.match(html, /id="demoInput"[^>]*\bmultiple\b/);
  assert.match(html, /id="demoBatch"[\s\S]*?id="demoBatchBar"[\s\S]*?id="demoBatchList"/);
  assert.match(source, /event => chooseFiles\(event\.target\.files\)/);
  assert.match(source, /event => chooseFiles\(event\.dataTransfer\.files\)/);
});

test("batch parsing is sequential and isolates individual failures", () => {
  assert.match(source, /for \(let index = 0; index < state\.files\.length; index \+= 1\)/);
  assert.match(source, /const result = await parseDemoFile\(file\);[\s\S]*?const response = await saveBatchMatch\(result\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*?updateBatchItem\(index, "error", reason\);[\s\S]*?failed \+= 1/);
  assert.doesNotMatch(source, /Promise\.all\(state\.files/);
});

test("batch reparsing automatically replaces duplicates and refreshes once", () => {
  assert.match(source, /response\.created === false && !response\.replaced\) response = await postParsedMatch\(result, true\)/);
  const batch = source.slice(source.indexOf("async function parseDemoBatch"), source.indexOf("function clear()"));
  assert.equal((batch.match(/await loadMatches\(0\)/g) || []).length, 1);
  assert.match(html, /Existing matches are replaced automatically when reparsed\./);
});

test("long batches request a screen wake lock without requiring browser support", () => {
  assert.match(source, /navigator\.wakeLock\?\.request\("screen"\)\.catch\(\(\) => null\)/);
  assert.match(source, /await wakeLock\?\.release\(\)\.catch\(\(\) => \{\}\)/);
});
