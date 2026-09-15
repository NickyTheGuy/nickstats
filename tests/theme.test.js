"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const graphs = fs.readFileSync(path.join(__dirname, "..", "js", "graphs.js"), "utf8");
const demo = fs.readFileSync(path.join(__dirname, "..", "js", "demo.js"), "utf8");

test("site chrome uses the cold-white orange and gold palette", () => {
  assert.match(styles, /color-scheme: light/);
  assert.match(styles, /--bg: rgb\(250, 250, 255\)/);
  assert.match(styles, /--accent: rgb\(233, 86, 49\)/);
  assert.match(styles, /--secondary-accent: rgb\(228, 182, 82\)/);
  assert.match(styles, /\.button-primary \{[\s\S]*?background: var\(--accent\)/);
  assert.match(styles, /\.tab-button\[aria-selected="true"\] \{[\s\S]*?background: var\(--accent\)/);
});

test("statistic highlights use the warm high-differentiation semantic palette", () => {
  assert.match(styles, /--section-positive: #4f7729/);
  assert.match(styles, /--section-negative: #ad343b/);
  assert.match(styles, /--section-opening: #925d00/);
  assert.match(styles, /--section-trades: #17796b/);
  assert.match(styles, /--section-context: #b64719/);
  assert.match(styles, /--section-movement: #784292/);
  assert.match(styles, /--section-multikills: #9e305c/);
  assert.match(styles, /--section-objectives: #785400/);
  assert.match(styles, /--section-timing: #794a32/);
  assert.match(styles, /\.opening-cell \{ background: rgba\(225, 153, 24, \.18\); \}/);
  assert.match(styles, /\.killContext-cell \{ background: rgba\(225, 82, 30, \.18\); \}/);
  assert.match(styles, /\.clutches-cell \{ background: rgba\(112, 155, 52, \.10\); \}/);
  assert.match(graphs, /\["#455f97", "#d18c00", "#168a77", "#9d51ba", "#bd343e"\]/);
});

test("match scoreboard leads with summaries and ends with round detail groups", () => {
  assert.match(demo, /\["Player", "Rating", "Rounds P\/W", "KAST"\][\s\S]*?groupHeader\(header, detailHeader, "combat"/);
  assert.match(demo, /groupHeader\(header, detailHeader, "utility"[\s\S]*?groupHeader\(header, detailHeader, "multikills"[\s\S]*?groupHeader\(header, detailHeader, "objectives"[\s\S]*?groupHeader\(header, detailHeader, "timing"/);
  assert.match(styles, /\.multikills-heading \{ background: rgba\(220, 65, 121, \.21\); \}/);
  assert.match(styles, /\.objectives-heading \{ background: rgba\(194, 143, 28, \.20\); \}/);
  assert.match(styles, /\.timing-heading \{ background: rgba\(181, 101, 61, \.21\); \}/);
});

test("all tab families share one surface and active-state treatment", () => {
  assert.match(styles, /:is\(\.data-tabs, \.mode-tabs, \.demo-result-tabs, \.match-browser-tabs, \.player-open-profiles, \.player-profile-tabs\)/);
  assert.match(styles, /:is\(\.data-tab\[aria-selected="true"\], \.tab-button\[aria-selected="true"\], \.demo-result-tab\.active, \.match-browser-tab\.active, \.player-profile-tab\.active\)/);
  assert.match(styles, /\.player-profile-tab\.active\) \{[\s\S]*?background: var\(--panel\)/);
  assert.match(styles, /box-shadow: inset 0 -3px 0 var\(--tab-active-accent\), 0 1px 3px rgba\(54, 38, 44, \.10\)/);
  assert.match(styles, /\.player-profile-tab\[data-player-view="context"\]\.active \{ --tab-active-accent: var\(--section-context\); \}/);
});

test("primary and secondary buttons have visible interaction feedback", () => {
  assert.match(styles, /\.button-primary:hover:not\(:disabled\) \{[\s\S]*?transform: translateY\(-1px\)/);
  assert.match(styles, /\.button-secondary:hover:not\(:disabled\) \{[\s\S]*?border-color: var\(--accent\);[\s\S]*?background: var\(--accent-wash\)/);
  assert.match(styles, /\.button:focus-visible \{[\s\S]*?outline: 2px solid rgba\(233, 86, 49, \.30\)/);
  assert.match(styles, /\.button:active:not\(:disabled\) \{[\s\S]*?transform: translateY\(0\)/);
});

test("collapsed scoreboard summaries stay within their columns", () => {
  assert.match(demo, /expandedGroups\.objectives \? \[74, 74\] : \[128\]/);
  assert.match(demo, /expandedGroups\.utility \? \[82, 82, 86, 94, 94, 94, 94, 58, 86, 58, 100, 112, 90\] : \[176\]/);
  assert.match(styles, /\.demo-score-table th,[\s\S]*?\.demo-score-table td \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/);
});

test("empty open-profile tabs remain fully hidden", () => {
  assert.match(styles, /\.player-open-profiles\[hidden\] \{ display: none; \}/);
});
