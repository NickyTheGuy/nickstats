#!/usr/bin/env node
// Node 20+; no npm install required. No demo data is uploaded.
import { createHash, webcrypto } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import vm from 'node:vm';
import { Worker, MessageChannel, isMainThread, parentPort, workerData } from 'node:worker_threads';

const script = fileURLToPath(import.meta.url);
const versions = ['4.0.0', '5.0.0'];
const bundleURL = version => `https://cdn.jsdelivr.net/npm/@deademx/cs2@${version}/dist/deadem-cs2.min.js`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function safeError(error) {
  // Do not export arbitrary messages: these can contain names, chat or local paths.
  const message = String(error?.message || error);
  const index = message.match(/Unable to (?:find|leave) (?:an )?entity with index \[\s*(\d+)\s*\]/i);
  const known = /Assertion failed|IllegalPathOp|EntityNotFound|MalformedMessage|FieldNoDecoder|out of bounds|out of memory|unexpected end|invalid magic|invalid header|not a supported|no completed rounds/i;
  return {
    category: index ? 'missing_entity' : message.match(known)?.[0] || 'unclassified_error',
    ...(message.match(/^([A-Za-z_$][\w$]*) is not defined$/) ? { missing_global: message.match(/^([A-Za-z_$][\w$]*) is not defined$/)[1] } : {}),
    ...(index ? { entity_index: Number(index[1]) } : {}),
    // Symbol names and locations only; exclude minified source excerpts and paths.
    frames: String(error?.stack || '').split('\n').filter(line => /^\s+at /.test(line))
      .slice(0, 8).map(line => {
        const symbol = line.match(/^\s+at ([\w.$<>]+)/)?.[1] || 'anonymous';
        const position = line.match(/:(\d+):(\d+)\)?$/);
        return { symbol, ...(position ? { line: +position[1], column: +position[2] } : {}) };
      })
  };
}

export function packetSummary(demoPacket, messagePacket) {
  const packet = messagePacket || demoPacket;
  const out = { tick: demoPacket.tick, sequence: demoPacket.sequence,
    type: packet.type?.code, id: packet.type?.id };
  if (messagePacket && /PacketEntities/i.test(packet.type?.code || '')) {
    for (const key of ['updatedEntries', 'maxEntries', 'isDelta', 'deltaFrom', 'baseline',
      'updateBaseline', 'hasPvsVisBitsDeprecated']) {
      const value = packet.data?.[key];
      if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    }
    if (packet.data?.entityData) out.entity_bytes = packet.data.entityData.byteLength;
  }
  return out;
}

export function matchSummary(result, diagnostics) {
  const players = (result.teams || []).flatMap(team => team.players || []);
  return {
    rounds: result.rounds,
    parsed_rounds: diagnostics?.parsed_completed_rounds,
    team_scores: (result.teams || []).map(team => team.score),
    player_count: players.length,
    round_records: result.round_timing?.length || 0,
    economy_records: result.round_economy?.length || 0,
    player_round_records: result.player_round_slices?.length || 0,
    death_records: result.death_events?.length || 0,
    players: players.map((player, slot) => ({ slot,
      has_steam_id: /^[0-9]{17}$/.test(player.steam_id || ''),
      ...Object.fromEntries(['kills','deaths','assists','headshots','damage','rounds_played',
        'trade_kills','trade_opportunities','trade_attempts'].map(key => [key, player[key]])),
      side_rounds: ['T','CT'].map(side => player.by_side?.[side]?.rounds_played ?? null),
      side_kills: ['T','CT'].map(side => player.by_side?.[side]?.kills ?? null),
      side_damage: ['T','CT'].map(side => player.by_side?.[side]?.damage ?? null),
      weapon_count: player.weapon_stats?.length || 0,
      speed_samples: player.kill_context?.speed_on_kill?.samples ?? null
    }))
  };
}

function contextFor(bundle, version) {
  const context = vm.createContext({ TextDecoder, TextEncoder, ReadableStream, WritableStream,
    TransformStream, DecompressionStream, CompressionStream, MessageChannel, performance,
    AbortController, AbortSignal,
    URL, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, atob, btoa,
    Uint8Array, ArrayBuffer, DataView, crypto: webcrypto,
    console: { log() {}, warn() {}, error() {}, debug() {}, info() {}, time() {}, timeEnd() {} } });
  context.self = context;
  context.window = context;
  vm.runInContext(bundle, context, { filename: `deadem-${version}.js` });
  const api = context.deademCs2 || context.deadem?.cs2;
  if (!api?.Parser) throw new Error('Parser browser API unavailable');
  return { context, api };
}

function instrument(parser, api, report) {
  let latest = 0;
  const add = entry => {
    report.recent_packets.push(entry);
    if (report.recent_packets.length > 24) report.recent_packets.shift();
  };
  parser.registerPreInterceptor(api.InterceptorStage.DEMO_PACKET, packet => {
    report.demo_packets_started++;
    add(packetSummary(packet));
    if (packet.type === api.DemoPacketType.DEM_STOP) report.saw_demo_stop = true;
    if (packet.type === api.DemoPacketType.DEM_FILE_HEADER) {
      report.demo_header = {};
      for (const key of ['patchVersion', 'buildNum', 'fullpacketsVersion', 'serverStartTick']) {
        if (typeof packet.data?.[key] === 'number') report.demo_header[key] = packet.data[key];
      }
    }
    if (performance.now() - latest > 2000) {
      latest = performance.now();
      parentPort.postMessage({ progress: { tick: packet.tick, packets: report.demo_packets_started } });
    }
  });
  parser.registerPreInterceptor(api.InterceptorStage.MESSAGE_PACKET, (demo, message) => {
    report.message_packets_started++;
    add(packetSummary(demo, message));
    const data = message.data;
    if (message.type === api.MessagePacketType.SVC_SERVER_INFO) {
      // Explicit allowlist: exclude server/map names, player identities and payloads.
      for (const key of ['protocol', 'serverCount', 'maxClients', 'maxClasses', 'tickInterval']) {
        if (typeof data?.[key] === 'number') report.server[key] = data[key];
      }
    }
  });
  parser.registerPostInterceptor(api.InterceptorStage.DEMO_PACKET, () => { report.demo_packets_completed++; });
  parser.registerPostInterceptor(api.InterceptorStage.MESSAGE_PACKET, () => { report.message_packets_completed++; });
}

function filteredConfiguration(api) {
  // Match the current production worker's entity and message allowlists.
  const bases = ['AK47','Aug','AWP','Bizon','CZ75a','DEagle','Elite','Famas','FiveSeven',
    'G3SG1','GalilAR','Glock','HKP2000','M249','M4A1','M4A1Silencer','MAC10','Mag7',
    'MP5SD','MP7','MP9','Negev','Nova','P250','P90','Revolver','Sawedoff','SCAR20',
    'SG556','SSG08','Taser','Tec9','UMP45','USPSilencer','USP_Silencer','XM1014',
    'Flashbang','HEGrenade','SmokeGrenade','MolotovGrenade','IncendiaryGrenade',
    'DecoyGrenade','Knife','KnifeGG'];
  return new api.ParserConfiguration({
    entityClasses: ['CCSTeam','CCSGameRulesProxy','CCSPlayerController','CCSPlayerPawn',
      ...bases.flatMap(name => [`C${name}`, `CWeapon${name}`])],
    messagePacketTypes: ['NET_SET_CON_VAR','SVC_SERVER_INFO','SVC_PACKET_ENTITIES',
      'GE_SOURCE1_LEGACY_GAME_EVENT_LIST','GE_SOURCE1_LEGACY_GAME_EVENT',
      'CS_UM_END_OF_MATCH_ALL_PLAYERS_DATA'].map(name => api.MessagePacketType[name])
  });
}

async function childRun() {
  const { bundle, version, mode, demoPath, source } = workerData;
  const report = { version, mode, status: 'running', demo_packets_started: 0,
    demo_packets_completed: 0, message_packets_started: 0, message_packets_completed: 0,
    server: {}, recent_packets: [], callback_errors: [], saw_demo_stop: false };
  let parser;
  let finished = false;
  const start = performance.now();
  const finish = error => {
    if (finished) return;
    finished = true;
    report.status = error ? 'failed' : 'passed';
    if (error) report.error = safeError(error);
    report.elapsed_seconds = Math.round((performance.now() - start) / 100) / 10;
    try { report.state_counts = parser?.getDemo().getStats(); } catch {}
    parentPort.postMessage({ result: report });
  };
  process.on('unhandledRejection', error => {
    if (report.callback_errors.length < 5) report.callback_errors.push(safeError(error));
  });
  try {
    const { context, api } = contextFor(bundle, version);
    const BaseParser = api.Parser;
    api.Parser = class extends BaseParser {
      constructor(...args) { super(...args); parser = this; instrument(this, api, report); }
      async parse(...args) {
        try { return await super.parse(...args); }
        catch (error) { report.parser_error = safeError(error); throw error; }
      }
    };
    if (mode === 'nickstats-worker') {
      let onMessage;
      context.importScripts = url => {
        if (url !== bundleURL(version)) throw new Error('Unexpected worker dependency');
        // Bundle already loaded and instrumented above.
      };
      context.addEventListener = (type, callback) => { if (type === 'message') onMessage = callback; };
      let complete;
      const result = new Promise(resolve => { complete = resolve; });
      context.postMessage = value => {
        if (value.type === 'result') {
          // Export only an allowlisted anonymous summary, never names/IDs/payloads.
          report.completed_rounds = value.result?.rounds;
          report.match_summary = matchSummary(value.result, value.diagnostics);
          complete(null);
        } else if (value.type === 'error') complete(new Error(value.message));
      };
      vm.runInContext(source, context, { filename: 'nickstats-demo-worker.js' });
      if (!onMessage) throw new Error('Worker did not register a parse handler');
      const bytes = await readFile(demoPath);
      await onMessage({ data: { type: 'parse', name: 'diagnostic.dem',
        data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } });
      const error = await result;
      // Let asynchronous interceptor errors surface before summarizing.
      await new Promise(resolve => setImmediate(resolve));
      finish(error || (report.callback_errors.length ? new Error('Worker callback failed') : null));
    } else {
      parser = new api.Parser(mode === 'filtered' ? filteredConfiguration(api) : undefined);
      await parser.parse(Readable.toWeb(createReadStream(demoPath)));
      await new Promise(resolve => setImmediate(resolve));
      finish(null);
    }
  } catch (error) { finish(error); }
  finally { try { await parser?.dispose(); } catch {} }
}

export function runIsolated(data, timeoutMs, onProgress = () => {}) {
  return new Promise(resolve => {
    const worker = new Worker(new URL(import.meta.url), { workerData: data });
    let settled = false;
    let progress = null;
    const done = report => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(report);
    };
    const timer = setTimeout(() => done({ version: data.version, mode: data.mode,
      status: 'timeout', last_progress: progress, timeout_seconds: timeoutMs / 1000 }), timeoutMs);
    worker.on('message', message => {
      if (message.progress) { progress = message.progress; onProgress(progress); }
      if (message.result) done(message.result);
    });
    worker.on('error', error => done({ version: data.version, mode: data.mode,
      status: 'harness_error', error: safeError(error) }));
    worker.on('exit', code => { if (!settled) done({ version: data.version, mode: data.mode,
      status: 'harness_error', worker_exit_code: code }); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) {
    console.log('Usage: node tools/diagnose-demo.mjs "/path/to/match.dem" [--out report.json] [--timeout 180] [--bundles directory] [--worker-only]\n'
      + 'Requires Node 20+. Extract .dem.bz2/.zst first. Only parser libraries are downloaded; the demo stays local.\n'
      + '--bundles uses local deadem-4.0.0.js and deadem-5.0.0.js instead of downloading.');
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node 20 or newer is required.');
  const demoPath = resolve(args.shift());
  const options = {};
  while (args.length) {
    const key = args.shift();
    if (key === '--worker-only') { options[key] = true; continue; }
    if (!['--out','--timeout','--bundles'].includes(key) || !args.length) throw new Error('Invalid arguments. Use --help.');
    options[key] = args.shift();
  }
  const timeout = Number(options['--timeout'] || 180);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600) throw new Error('Timeout must be 1–3600 seconds.');
  const output = resolve(options['--out'] || 'nickstats-parser-report.json');
  if (output === demoPath || await stat(output).then(() => true, () => false)) {
    throw new Error('Output already exists or is the demo. Choose a new --out filename.');
  }
  const file = await stat(demoPath);
  if (!file.isFile()) throw new Error('Demo must be a file.');
  const handle = await import('node:fs/promises').then(fs => fs.open(demoPath, 'r'));
  const header = Buffer.alloc(8);
  try { await handle.read(header, 0, 8, 0); } finally { await handle.close(); }
  if (header.toString('ascii') !== 'PBDEMS2\0') throw new Error('Not an extracted CS2 .dem (PBDEMS2). Extract compressed demos first.');
  console.log('Fingerprinting demo locally…');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(demoPath)) hash.update(chunk);
  const report = { format: 'nickstats.parser-diagnostics/1', created_at: new Date().toISOString(),
    node: process.versions.node, platform: process.platform, architecture: process.arch,
    demo: { bytes: file.size, sha256: hash.digest('hex') }, libraries: [], runs: [] };
  let source = null;
  let workerVersion = null;
  try { source = await readFile(join(dirname(script), '../js/demo-worker.js'), 'utf8'); }
  catch { console.log('NickStats worker not found: running standalone parser comparisons only.'); }
  if (source) {
    workerVersion = versions.find(version => source.includes(bundleURL(version)));
    if (!workerVersion) throw new Error('NickStats worker uses an unsupported parser version.');
    report.nickstats_worker_sha256 = digest(source);
  }
  if (options['--worker-only'] && !source) throw new Error('--worker-only requires the tool inside the repository tools folder.');
  for (const version of options['--worker-only'] ? [workerVersion] : versions) {
    let bundle;
    try {
      if (options['--bundles']) bundle = await readFile(join(resolve(options['--bundles']), `deadem-${version}.js`), 'utf8');
      else {
        console.log(`Downloading parser ${version} (demo is not uploaded)…`);
        const response = await fetch(bundleURL(version), { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bundle = await response.text();
      }
    } catch {
      report.runs.push({ version, status: 'library_unavailable' });
      await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
      console.log(`Could not load ${version}; continuing.`);
      continue;
    }
    report.libraries.push({ version, sha256: digest(bundle), url: bundleURL(version) });
    const modes = options['--worker-only'] ? ['nickstats-worker']
      : version === workerVersion ? ['nickstats-worker','filtered','unfiltered'] : ['filtered','unfiltered'];
    for (const mode of modes) {
      console.log(`Testing ${version}: ${mode}…`);
      let lastLog = 0;
      const result = await runIsolated({ bundle, version, mode, demoPath, source }, timeout * 1000, progress => {
        if (Date.now() - lastLog > 10000) { lastLog = Date.now(); console.log(`  tick ${progress.tick}; ${progress.packets} packets`); }
      });
      report.runs.push(result);
      await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
      console.log(`  ${result.status}${result.error ? ` (${result.error.category})` : ''}`);
    }
  }
  console.log(`Report saved: ${output}\nSend this JSON report, not the demo. It contains no raw packets, filenames, player names, Steam IDs or chat.\nA parser pass does not verify NickStats statistic accuracy or prove browser compatibility.`);
}

if (!isMainThread) await childRun();
else if (process.argv[1] && resolve(process.argv[1]) === script) {
  main().catch(error => { console.error(`Diagnostic could not finish: ${error.message}\nUse --help for instructions.`); process.exitCode = 1; });
}
