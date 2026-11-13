const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('diagnostic errors retain entity location but omit names, paths and source excerpts', async () => {
  const { safeError } = await import('../tools/diagnose-demo.mjs');
  const error = new Error('Unable to find an entity with index [ 128 ]');
  error.stack = 'secret-player C:/Users/private/demo.dem\nsource code secret-chat\n    at Decoder.update (C:/Users/private/parser.js:2:123)';
  const result = safeError(error);
  assert.equal(result.category, 'missing_entity');
  assert.equal(result.entity_index, 128);
  assert.deepEqual(result.frames, [{ symbol: 'Decoder.update', line: 2, column: 123 }]);
  assert.doesNotMatch(JSON.stringify(result), /secret|private|Users/);
  assert.equal(safeError(new Error('secret chat content')).category, 'unclassified_error');
});

test('diagnostic packet summaries allow only structural metadata', async () => {
  const { packetSummary } = await import('../tools/diagnose-demo.mjs');
  const result = packetSummary({ tick: 99, sequence: 3 }, {
    type: { code: 'svc_PacketEntities', id: 55 },
    data: { updatedEntries: 4, isDelta: true, entityData: Buffer.from('secret'),
      username: 'private', steamid: '76561190000000000', chat: 'secret' }
  });
  assert.deepEqual(result, { tick: 99, sequence: 3, type: 'svc_PacketEntities', id: 55,
    updatedEntries: 4, isDelta: true, entity_bytes: 6 });
});

const fixtureBundle = `
globalThis.deademCs2 = {
  InterceptorStage: { DEMO_PACKET: 1, MESSAGE_PACKET: 2 },
  DemoPacketType: { DEM_FILE_HEADER: {} }, MessagePacketType: {},
  Parser: class {
    pre = new Map(); post = new Map();
    registerPreInterceptor(s, fn) { this.pre.set(s,fn); }
    registerPostInterceptor(s, fn) { this.post.set(s,fn); }
    getDemo() { return { getStats: () => ({entities: 0}) }; }
    async dispose() {}
    async parse() {
      const demo = {tick: 100, sequence: 7, type: {code:'DEM_Packet',id:7}};
      this.pre.get(1)(demo);
      this.pre.get(2)(demo, {type:{code:'svc_PacketEntities',id:55},data:{updatedEntries:1}});
      throw new Error('Unable to find an entity with index [ 128 ]');
    }
  }
};`;

test('isolated diagnostic preserves the failing packet and stops cleanly', async () => {
  const { runIsolated } = await import('../tools/diagnose-demo.mjs');
  const result = await runIsolated({ version: '4.0.0', mode: 'unfiltered', bundle: fixtureBundle,
    demoPath: __filename }, 10000);
  assert.equal(result.status, 'failed');
  assert.equal(result.error.entity_index, 128);
  assert.equal(result.parser_error.entity_index, 128);
  assert.equal(result.demo_packets_started, 1);
  assert.equal(result.demo_packets_completed, 0);
  assert.equal(result.recent_packets.at(-1).updatedEntries, 1);
});

test('an unresponsive parser is terminated and produces a timeout report', async () => {
  const { runIsolated } = await import('../tools/diagnose-demo.mjs');
  const bundle = fixtureBundle.replace("throw new Error('Unable to find an entity with index [ 128 ]');", 'while(true) {}');
  const result = await runIsolated({ version: '4.0.0', mode: 'unfiltered', bundle,
    demoPath: __filename }, 200);
  assert.equal(result.status, 'timeout');
});

test('comparison allowlists stay aligned with the production worker', async () => {
  const worker = readFileSync(require.resolve('../js/demo-worker.js'), 'utf8');
  const tool = readFileSync(require.resolve('../tools/diagnose-demo.mjs'), 'utf8');
  const weaponNames = worker.match(/const WEAPON_ENTITY_BASE_NAMES = \[([\s\S]*?)\];/)[1].match(/"([^"]+)"/g).map(s => JSON.parse(s));
  for (const name of weaponNames) assert.ok(tool.includes(`'${name}'`), name);
  const messageNames = worker.match(/messagePacketTypes: \[([\s\S]*?)\]/)[1].match(/MessagePacketType\.\w+/g).map(s => s.split('.')[1]);
  for (const name of messageNames) assert.ok(tool.includes(`'${name}'`), name);
});

test('worker summaries include useful statistics without identities or arbitrary fields', async () => {
  const { matchSummary } = await import('../tools/diagnose-demo.mjs');
  const summary = matchSummary({rounds:19,teams:[{name:'secret-team',score:13,players:[{
    name:'private-player',steam_id:'76561198012345678',kills:17,rounds_played:19,
    by_side:{T:{rounds_played:7,kills:5},CT:{rounds_played:12,kills:12}},
    chat:'private-chat',kill_context:{speed_on_kill:{samples:17}}
  }]}]}, {parsed_completed_rounds:19});
  assert.equal(summary.players[0].has_steam_id, true);
  assert.equal(summary.players[0].speed_samples, 17);
  assert.deepEqual(summary.players[0].side_rounds, [7,12]);
  assert.doesNotMatch(JSON.stringify(summary), /secret|private|765611/);
});
