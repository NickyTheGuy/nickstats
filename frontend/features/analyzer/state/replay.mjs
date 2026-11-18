export const MAX_REPLAY_BYTES = 128 * 1024 * 1024;
export const MAX_SAMPLES = 1000000;
export const UTILITY_TYPES = ['Smoke', 'Flash', 'HE', 'Fire', 'Decoy'];
export const PLAYER_COLORS = ['#63d2ff', '#ffca62', '#c4a1ff', '#ff859e', '#7fe0b1', '#b0c7ff', '#faaf74', '#e4a6ec', '#b9dd68', '#64d5d3'];
const fail = message => { throw new Error(`Invalid replay: ${message}`); };
const finite = (n, max = 100000) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
export const GRENADE_ICONS = ['hegrenade','flashbang','smokegrenade','molotov','incgrenade','decoy'];
const text = (s, max = 200) => typeof s === 'string' && s.length > 0 && s.length <= max;

// Validate imported files before any drawing or interpolation. Unknown metadata never becomes markup/URLs.
export function validateReplay(input) {
  if (!input || input.format !== 'nickstats.replay' || ![1,2,3,4].includes(input.version) || input.coordinate_system !== 'source2-world') fail('unsupported format or version.');
  if (!text(input.match_uid) || !text(input.map, 100) || !text(input.source_file, 500)) fail('missing match identity.');
  if (!finite(input.sample_hz, 64) || input.sample_hz <= 0) fail('invalid sample rate.');
  if (!Array.isArray(input.players) || !input.players.length || input.players.length > 64) fail('invalid roster.');
  const players = input.players.map(p => {
    if (!p || !text(p.id) || !text(p.name) || !(p.steam_id == null || typeof p.steam_id === 'string' && /^\d{1,20}$/.test(p.steam_id))) fail('invalid player.');
    return { id: p.id, name: p.name, steam_id: p.steam_id || null };
  });
  const ids = new Set(players.map(p => p.id));
  if (ids.size !== players.length) fail('duplicate player.');
  if (!Array.isArray(input.rounds) || !input.rounds.length) fail('invalid rounds.');
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
        if (!Array.isArray(s) || s.length !== (input.version>=3?7:6) || !s.slice(0,6).every(n => finite(n, 600000)) || input.version>=3 && !(s[6]===null || finite(s[6],180)) || s[0] < 0 || s[0] <= previous || s[0] > round.duration || s.slice(1,4).some(n => Math.abs(n) > 32768) || s[4] < 0 || s[4] > 100 || ![2,3].includes(s[5])) fail('invalid or unordered position sample.');
        previous = s[0];
      }
      return { player: track.player, samples: track.samples };
    });
    if (!Array.isArray(round.utility)) fail('invalid utility events.');
    let previous = -1;
    const utility = round.utility.map(e => {
      if (++eventCount > 100000 || !e || !UTILITY_TYPES.includes(e.type) || !(e.player === null || ids.has(e.player)) || !finite(e.time, round.duration) || e.time < previous || e.time < 0 || ![e.x,e.y,e.z].every(n => finite(n, 32768))) fail('invalid utility event.');
      previous = e.time;
      const effect = { type:e.type,player:e.player,time:e.time,x:e.x,y:e.y,z:e.z };
      if (input.version >= 2) {
        if (!finite(e.end,round.duration) || e.end<e.time || !finite(e.radius,512) || e.radius<0 || ![0,2,3].includes(e.side) || !GRENADE_ICONS.includes(e.icon) || typeof e.estimated!=='boolean') fail('invalid utility lifetime or geometry.');
        Object.assign(effect,{end:e.end,radius:e.radius,side:e.side,icon:e.icon,estimated:e.estimated});
      }
      return effect;
    });
    const output = {number:round.number,duration:round.duration,winner:round.winner,tracks,utility};
    if (input.version >= 2) {
      if (!Array.isArray(round.projectiles) || round.projectiles.length>100000) fail('invalid projectiles.');
      const projectileIds = new Set();
      output.projectiles = round.projectiles.map(p => {
        if (!p || !text(p.id) || projectileIds.has(p.id) || !UTILITY_TYPES.includes(p.type) || !GRENADE_ICONS.includes(p.icon) || !(p.player===null || ids.has(p.player)) || ![0,2,3].includes(p.side) || !finite(p.end,round.duration) || p.end<0 || !Array.isArray(p.samples) || !p.samples.length) fail('invalid projectile.');
        projectileIds.add(p.id); let previous = -1;
        for (const sample of p.samples) {
          if (++sampleCount>MAX_SAMPLES) fail('too many position samples.');
          if (!Array.isArray(sample) || sample.length!==4 || !sample.every(n=>finite(n,600000)) || sample[0]<0 || sample[0]<=previous || sample[0]>p.end || sample.slice(1).some(n=>Math.abs(n)>32768)) fail('invalid projectile sample.');
          previous = sample[0];
        }
        return {id:p.id,type:p.type,icon:p.icon,player:p.player,side:p.side,end:p.end,samples:p.samples};
      });
    }
    if(input.version>=3) {
      if(!Array.isArray(round.firing)||round.firing.length>players.length||!Array.isArray(round.deaths))fail('invalid combat data.');
      const shooters=new Set();
      output.firing=round.firing.map(track=>{
        if(!track||!ids.has(track.player)||shooters.has(track.player)||!Array.isArray(track.samples)||!track.samples.length)fail('invalid shooter.');
        shooters.add(track.player);let previous=-1;
        for(const s of track.samples) {
          if(++sampleCount>MAX_SAMPLES)fail('too many position samples.');
          if(!Array.isArray(s)||s.length!==6||!s.slice(0,4).every(n=>finite(n,600000))||s[0]<0||s[0]<=previous||s[0]>round.duration||s.slice(1,4).some(n=>Math.abs(n)>32768)||!(s[4]===null||finite(s[4],180))||![2,3].includes(s[5]))fail('invalid firing sample.');
          previous=s[0];
        }
        return {player:track.player,samples:track.samples};
      });
      let previous=-1;
      output.deaths=round.deaths.map(e=>{
        if(++eventCount>100000||!e||!ids.has(e.victim)||!(e.killer===null||ids.has(e.killer))||!finite(e.time,round.duration)||e.time<0||e.time<previous||![2,3].includes(e.victim_side)||![0,2,3].includes(e.killer_side)||![e.x,e.y,e.z].every(n=>finite(n,32768))||!(e.from===null||Array.isArray(e.from)&&e.from.length===3&&e.from.every(n=>finite(n,32768)))||!text(e.weapon,100)||typeof e.headshot!=='boolean')fail('invalid death event.');
        previous=e.time;
        return {time:e.time,victim:e.victim,killer:e.killer,victim_side:e.victim_side,killer_side:e.killer_side,x:e.x,y:e.y,z:e.z,from:e.from,weapon:e.weapon,headshot:e.headshot};
      });
    }
    if(input.version>=4) {
      if(!Array.isArray(round.context)||round.context.length>players.length)fail('invalid round context.');
      const seen=new Set();
      output.context=round.context.map(c=>{
        if(!c||!ids.has(c.player)||seen.has(c.player)||![2,3].includes(c.side)||![null,'win','loss'].includes(c.result)||![null,'full','force','eco','pistol'].includes(c.buy)||![null,'full','force','eco','pistol'].includes(c.enemy_buy)||typeof c.hero!=='boolean')fail('invalid player round context.');
        seen.add(c.player);return {player:c.player,side:c.side,result:c.result,buy:c.buy,enemy_buy:c.enemy_buy,hero:c.hero};
      });
    }
    return output;
  }).sort((a,b) => a.number - b.number);
  const replay = { format: input.format, version: input.version, coordinate_system: input.coordinate_system, sample_hz: input.sample_hz,
    match_uid: input.match_uid, map: input.map, source_file: input.source_file, players, rounds };
  if (input.version >= 2) {
    if (!input.rules || ![input.rules.regulation_rounds,input.rules.overtime_rounds].every(n=>Number.isSafeInteger(n)&&n>0) || !finite(input.projectile_hz,64) || input.projectile_hz<=0) fail('invalid match rules.');
    replay.rules = {regulation_rounds:input.rules.regulation_rounds,overtime_rounds:input.rules.overtime_rounds};
    replay.projectile_hz = input.projectile_hz;
  }
  if (input.demo_sha256 != null) {
    if (typeof input.demo_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.demo_sha256)) fail('invalid demo fingerprint.');
    replay.demo_sha256 = input.demo_sha256;
  }
  return replay;
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
  const point=[time,a[1]+(b[1]-a[1])*ratio,a[2]+(b[2]-a[2])*ratio,a[3]+(b[3]-a[3])*ratio,a[4],a[5]];
  if(a.length===7)point.push(a[6]===null||b[6]===null?a[6]:a[6]+((b[6]-a[6]+540)%360-180)*ratio);
  return point;
}
export function worldToRadar(map, x, y) { return [(x-map.pos_x)/map.scale, (map.pos_y-y)/map.scale]; }
export function onLevel(level, z) { return z >= level.min && z < level.max; }
export function formatTime(ms) { return `${Math.floor(ms/60000)}:${(ms/1000%60).toFixed(1).padStart(4,'0')}`; }
