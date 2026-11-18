#!/usr/bin/env node
// Read-only measurement of a local replay. No demo parsing or server access.
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { validateReplay } from '../frontend/features/analyzer/state/replay.mjs';

export function measureReplaySize(input) {
  const replay=validateReplay(input),baseline=structuredClone(replay);
  if(baseline.version>=3) {
    baseline.version=2;
    for(const round of baseline.rounds) {
      delete round.firing;delete round.deaths;delete round.context;
      for(const track of round.tracks)track.samples=track.samples.map(s=>s.slice(0,6));
    }
  }
  const actual=Buffer.from(JSON.stringify(replay)),prior=Buffer.from(JSON.stringify(baseline));
  return {version:replay.version,rounds:replay.rounds.length,
    position_samples:replay.rounds.reduce((n,r)=>n+r.tracks.reduce((n,t)=>n+t.samples.length,0),0),
    firing_samples:replay.rounds.reduce((n,r)=>n+(r.firing||[]).reduce((n,t)=>n+t.samples.length,0),0),
    deaths:replay.rounds.reduce((n,r)=>n+(r.deaths||[]).length,0),
    json_bytes:actual.length,without_combat_json_bytes:prior.length,combat_added_bytes:actual.length-prior.length,
    combat_added_percent:Number(((actual.length/prior.length-1)*100).toFixed(2)),
    gzip_bytes:gzipSync(actual).length,without_combat_gzip_bytes:gzipSync(prior).length,
    server_replay_storage_bytes:0,
    note:'Canonical local replay JSON, compared with the same replay without aim/firing/deaths/round context. Gzip is illustrative; exports are plain JSON. Replay files are not stored by the API.'};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]) {
  try {
    if(!process.argv[2])throw new Error('Usage: node tools/measure-replay-size.mjs /path/to/match.replay.json');
    console.log(JSON.stringify(measureReplaySize(JSON.parse(await readFile(process.argv[2],'utf8'))),null,2));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
