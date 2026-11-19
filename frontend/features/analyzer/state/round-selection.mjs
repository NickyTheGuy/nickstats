export function roundKey(replay,round) { return `${replay.match_uid}:${round.number}`; }
export function matchRules(replay) { return replay.rules || {regulation_rounds:24,overtime_rounds:6}; }

export function roundSection(replay,number) {
  const rules = matchRules(replay), regulation = rules.regulation_rounds;
  if (number <= regulation) {
    const half = number <= Math.ceil(regulation/2) ? 1 : 2;
    return {key:`reg-${half}`,label:`Regulation · half ${half}`,phase:'regulation'};
  }
  const index = number-regulation-1, overtime = Math.floor(index/rules.overtime_rounds)+1;
  const half = index%rules.overtime_rounds < Math.ceil(rules.overtime_rounds/2) ? 1 : 2;
  return {key:`ot-${overtime}-${half}`,label:`OT ${overtime} · half ${half}`,phase:'overtime'};
}
export function roundSections(replay) {
  const sections = new Map();
  for (const round of replay.rounds) {
    const section = roundSection(replay,round.number);
    if (!sections.has(section.key)) sections.set(section.key,{...section,rounds:[]});
    sections.get(section.key).rounds.push(round);
  }
  return [...sections.values()];
}
export function matchesSide(round,side,players) {
  if (!side) return true;
  const chosen = new Set(players);
  return round.tracks.some(track=>chosen.has(track.player) && track.samples.some(s=>s[5]===side));
}
export function presetRounds(replays,{phase='all',side=0,players=[]}={}) {
  return replays.flatMap(replay=>replay.rounds.filter(round=>(phase==='all'||roundSection(replay,round.number).phase===phase) && matchesSide(round,side,players)).map(round=>roundKey(replay,round)));
}
export function replaySampleCount(replay) {
  return replay.rounds.reduce((sum,round)=>sum+round.tracks.reduce((n,t)=>n+t.samples.length,0)+(round.projectiles||[]).reduce((n,p)=>n+p.samples.length,0)+(round.equipment||[]).reduce((n,t)=>n+t.samples.length,0)+(round.firing||[]).reduce((n,t)=>n+t.samples.length,0),0);
}

export function matchesBuy(choices,buy,hero=false) {
  const selected=Array.isArray(choices)?choices:choices==='all'?[]:[choices];
  return !selected.length||selected.includes('all')||selected.includes(buy)||selected.includes('hero')&&hero;
}
export function matchesRound(round,{players=[],side=0,result='all',buy='all',enemyBuy='all'}={}) {
  const chosen=new Set(players),contexts=round.context?.length?round.context:(round.tracks||[]).map(track=>{const side=track.samples[0]?.[5];return {player:track.player,side,result:round.winner?((side===2?'T':'CT')===round.winner?'win':'loss'):null,buy:null,enemy_buy:null,hero:false};});
  return contexts.some(c=>chosen.has(c.player)&&(!side||c.side===side)&&(result==='all'||c.result===result)&&
    matchesBuy(buy,c.buy,c.hero)&&matchesBuy(enemyBuy,c.enemy_buy));
}
export function toggleRoundSet(selected,keys) {
  if(!keys.length)return selected;
  const set=new Set(selected),remove=keys.every(key=>set.has(key));
  for(const key of keys)remove?set.delete(key):set.add(key);
  return [...set];
}
export function combinedSections(replays,filters) {
  const sections=new Map();
  for(const replay of replays)for(const section of roundSections(replay)) {
    if(!sections.has(section.key))sections.set(section.key,{key:section.key,label:section.label,phase:section.phase,numbers:new Map()});
    const combined=sections.get(section.key);
    for(const round of section.rounds) {
      if(!combined.numbers.has(round.number))combined.numbers.set(round.number,[]);
      if(matchesRound(round,filters))combined.numbers.get(round.number).push(roundKey(replay,round));
    }
  }
  return [...sections.values()].map(section=>({...section,numbers:[...section.numbers].sort(([a],[b])=>a-b),keys:[...section.numbers.values()].flat()}));
}
