"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const frontend = fs.readFileSync(path.join(root, "js", "demo.js"), "utf8");
const routes = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Routes.swift"), "utf8");
const auth = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Auth.swift"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const schema = fs.readFileSync(path.join(root, "database", "schema.sql"), "utf8");
const accountPlayerMigration = fs.readFileSync(path.join(root, "database", "migrations", "015_account_player.sql"), "utf8");

test("browser login uses a persistent server session instead of storing the upload token", () => {
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/session`/);
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/login`/);
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/logout`/);
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/password`/);
  assert.match(frontend, /fetch\(`\$\{AUTH_ENDPOINT\}\/player`/);
  assert.doesNotMatch(frontend, /uploadToken|Authorization.*Bearer/);
});

test("upload authorization accepts signed sessions and retains bearer compatibility", () => {
  assert.match(routes, /app\.post\("auth", "login"\)/);
  assert.match(routes, /app\.get\("auth", "session"\)/);
  assert.match(routes, /app\.post\("auth", "logout"\)/);
  assert.match(routes, /app\.post\("auth", "password"\)/);
  assert.match(routes, /app\.post\("auth", "player"\)/);
  assert.match(routes, /if authenticatedUsername\(request\) != nil \{ return \}/);
  assert.match(routes, /environmentName: "NICKSTATS_UPLOAD_TOKEN"/);
  assert.match(auth, /HttpOnly; SameSite=Strict/);
  assert.match(auth, /HMAC<SHA256>/);
  assert.match(auth, /passwordHash/);
  assert.match(auth, /INSERT INTO auth_users/);
  assert.match(auth, /HEX\(password_hash\)/);
  assert.match(auth, /UNHEX\(\\\(bind: hashHex\)\)/);
});

test("the site-wide account menu stores a representative player", () => {
  const heroEnd = index.indexOf("</header>");
  const accountButton = index.indexOf('id="demoAuthButton"');
  const uploadPanel = index.indexOf('class="panel demo-panel demo-upload-panel"');
  assert.ok(accountButton > 0 && accountButton < heroEnd);
  assert.ok(uploadPanel > heroEnd);
  assert.match(index, /id="demoAccountPlayerSearch"/);
  assert.match(schema, /representative_player_id BIGINT UNSIGNED NULL/);
  assert.match(accountPlayerMigration, /FOREIGN KEY \(representative_player_id\) REFERENCES players \(id\)/);
});
