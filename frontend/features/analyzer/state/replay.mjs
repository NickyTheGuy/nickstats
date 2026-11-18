export const MAX_REPLAY_BYTES = 128 * 1024 * 1024;
export const MAX_SAMPLES = 1000000;
export const UTILITY_TYPES = ['Smoke', 'Flash', 'HE', 'Fire', 'Decoy'];
export const PLAYER_COLORS = ['#63d2ff', '#ffca62', '#c4a1ff', '#ff859e', '#7fe0b1', '#b0c7ff', '#faaf74', '#e4a6ec', '#b9dd68', '#64d5d3'];
const fail = message => { throw new Error(`Invalid replay: ${message}`); };
const finite = (n, max = 100000) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
const text = (s, max = 200) => typeof s === 'string' && s.length > 0 && s.length <= max;

// Validate imported files before any drawing or interpolation. Unknown metadata never becomes markup/URLs.
export function validateReplay(input) {
  if (!input || input.format !== 'nickstats.replay' || input.version !== 1 || input.coordinate_system !== 'source2-world') fail('unsupported format or version.');
  if (!text(input.match_uid) || !text(input.map, 100) || !text(input.source_file, 500)) fail('missing match identity.');
  if (!finite(input.sample_hz, 64) || input.sample_hz <= 0) fail('invalid sample rate.');
  if (!Array.isArray(input.players) || !input.players.length || input.players.length > 64) fail('invalid roster.');
  const players = input.players.map(p => {
    if (!p || !text(p.id) || !text(p.name) || !(p.steam_id == null || typeof p.steam_id === 'string' && /^\d{1,20}$/.test(p.steam_id))) fail('invalid player.');
    return { id: p.id, name: p.name, steam_id: p.steam_id || null };
  });
  const ids = new Set(players.map(p => p.id));
  if (ids.size !== players.length) fail('duplicate player.');
  if (!Array.isArray(input.rounds) || !input.rounds.length || input.rounds.length > 256) fail('invalid rounds.');
  const numbers = new Set(); let sampleCount = 0, eventCount = 0;
  const rounds = input.rounds.map(round => {
    if (!round || !Number.isInteger(round.number) || round.number < 1 || numbers.has(round.number)) fail('duplicate or invalid round number.');
    numbers.add(round.number);
    if (!finite(round.duration, 600000) || round.duration < 0 || ![null, 'T', 'CT'].includes(round.winner)) fail('invalid round timing.');
    if (!Array.isArray(round.tracks) || !round.tracks.length || round.tracks.length > players.length) fail('invalid tracks.');
    const seen = new Set();
    const tracks = round.tracks.map(track => {
      if (!track || !ids.has(track.player) || seen.has(track.player) || !Array.isArray(track.samples) || !track.samples.length) fail('invalid track owner.');
      seen.add(track.player);
      let previous = -1;
      for (const s of track.samples) {
        if (++sampleCount > MAX_SAMPLES) fail('too many position samples.');
        if (!Array.isArray(s) || s.length !== 6 || !s.every(n => finite(n, 600000)) || s[0] < 0 || s[0] <= previous || s[0] > round.duration || s.slice(1,4).some(n => Math.abs(n) > 32768) || s[4] < 0 || s[4] > 100 || ![2,3].includes(s[5])) fail('invalid or unordered position sample.');
        previous = s[0];
      }
      return { player: track.player, samples: track.samples };
    });
    if (!Array.isArray(round.utility)) fail('invalid utility events.');
    let previous = -1;
    const utility = round.utility.map(e => {
      if (++eventCount > 100000 || !e || !UTILITY_TYPES.includes(e.type) || !(e.player === null || ids.has(e.player)) || !finite(e.time, round.duration) || e.time < previous || e.time < 0 || ![e.x,e.y,e.z].every(n => finite(n, 32768))) fail('invalid utility event.');
      previous = e.time;
      return { type: e.type, player: e.player, time: e.time, x: e.x, y: e.y, z: e.z };
    });
    return { number: round.number, duration: round.duration, winner: round.winner, tracks, utility };
  }).sort((a,b) => a.number - b.number);
  return { format: input.format, version: 1, coordinate_system: input.coordinate_system, sample_hz: input.sample_hz,
    match_uid: input.match_uid, map: input.map, source_file: input.source_file, players, rounds };
}

// Binary search avoids rescanning the entire round at every animation frame.
export function sampleIndex(samples, time) {
  let low = 0, high = samples.length;
  while (low < high) { const mid = (low + high) >>> 1; if (samples[mid][0] <= time) low = mid + 1; else high = mid; }
  return low - 1;
}
export function positionAt(samples, time) {
  const index = sampleIndex(samples, time), a = samples[index], b = samples[index + 1];
  if (!a || a[4] === 0 || time - a[0] > 600) return null;
  if (!b || b[4] === 0 || b[5] !== a[5] || b[0] - a[0] > 600 || Math.hypot(b[1]-a[1],b[2]-a[2]) > 300) return a;
  const ratio = (time-a[0]) / (b[0]-a[0]);
  return [time, a[1]+(b[1]-a[1])*ratio, a[2]+(b[2]-a[2])*ratio, a[3]+(b[3]-a[3])*ratio, a[4], a[5]];
}
export function worldToRadar(map, x, y) { return [(x-map.pos_x)/map.scale, (map.pos_y-y)/map.scale]; }
export function onLevel(level, z) { return z >= level.min && z < level.max; }
export function formatTime(ms) { return `${Math.floor(ms/60000)}:${(ms/1000%60).toFixed(1).padStart(4,'0')}`; }
