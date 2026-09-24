"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const frontend = fs.readFileSync(path.join(root, "js", "demo.js"), "utf8");
const routes = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Routes.swift"), "utf8");
const auth = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Auth.swift"), "utf8");

test("browser login uses a persistent server session instead of storing the upload token", () => {
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/session`/);
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/login`/);
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/logout`/);
  assert.doesNotMatch(frontend, /uploadToken|Authorization.*Bearer/);
});

test("upload authorization accepts signed sessions and retains bearer compatibility", () => {
  assert.match(routes, /app\.post\("auth", "login"\)/);
  assert.match(routes, /app\.get\("auth", "session"\)/);
  assert.match(routes, /app\.post\("auth", "logout"\)/);
  assert.match(routes, /if authenticatedUsername\(request\) != nil \{ return \}/);
  assert.match(routes, /environmentName: "NICKSTATS_UPLOAD_TOKEN"/);
  assert.match(auth, /HttpOnly; SameSite=Strict/);
  assert.match(auth, /HMAC<SHA256>/);
});
