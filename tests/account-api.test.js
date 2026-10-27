const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../frontend/state/account-api.mjs');

test('account requests retain session endpoints and payloads, trim usernames, and clear linked players with null', async () => {
  const { createAccountAPI } = await modulePromise;
  const calls = [];
  const api = createAccountAPI(async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => ({ authenticated: true, username: 'nick' }) };
  });
  await api.login({ username: ' nick ', password: 'sample-password' });
  await api.player({ id: '42' }); await api.player(null);
  await api.password({ currentPassword: 'old-password', newPassword: 'new-password', confirmation: 'ignored' });
  await api.logout();
  assert.deepEqual(calls.map(call => call.url), ['login', 'player', 'player', 'password', 'logout'].map(path => `/nickstats/api/auth/${path}`));
  assert.deepEqual(calls.slice(0, 4).map(call => JSON.parse(call.body)), [
    { username: 'nick', password: 'sample-password' }, { player_id: '42' }, { player_id: null },
    { current_password: 'old-password', new_password: 'new-password' }
  ]);
  for (const call of calls) {
    assert.equal(call.method, 'POST'); assert.equal(call.headers.Accept, 'application/json');
    assert.equal(call.headers.Authorization, undefined);
  }
  assert.equal(calls[4].body, undefined);
});

test('account failures retain server reasons and reject unsuccessful logout instead of claiming the user is signed out', async () => {
  const { createAccountAPI } = await modulePromise;
  const denied = createAccountAPI(async () => ({ ok: false, status: 403, json: async () => ({ reason: 'Current password is incorrect.' }) }));
  await assert.rejects(denied.password({}), /Current password is incorrect/);
  const unavailable = createAccountAPI(async () => ({ ok: false, status: 503, json: async () => { throw new Error('not JSON'); } }));
  await assert.rejects(unavailable.logout(), /Logout failed with HTTP 503/);
  const offline = createAccountAPI(async () => { throw new Error('Network unavailable'); });
  await assert.rejects(offline.player(null), /Network unavailable/);
});

test('login validates empty credentials before requesting and retains the successful empty-body fallback', async () => {
  const { createAccountAPI } = await modulePromise;
  let calls = 0;
  const api = createAccountAPI(async () => { calls++; return { ok: true, json: async () => null }; });
  await assert.rejects(api.login({ username: ' ', password: 'x' }), /Enter your username and password/);
  await assert.rejects(api.login({ username: 'nick', password: '' }), /Enter your username and password/);
  assert.equal(calls, 0);
  assert.deepEqual(await api.login({ username: ' nick ', password: 'x' }), { authenticated: true, username: 'nick' });
  assert.equal(calls, 1);
});
