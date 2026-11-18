export function replayFixture(uid='one',rounds=4) {
  const players=[1,2,3].map(n=>({id:`steam:${n}`,name:`Player ${n}`,steam_id:String(n)}));
  return {format:'nickstats.replay',version:4,coordinate_system:'source2-world',sample_hz:5,projectile_hz:20,
    match_uid:`sha256:${uid}`,demo_sha256:'a'.repeat(64),map:'de_mirage',source_file:'test.dem',rules:{regulation_rounds:24,overtime_rounds:6},players,
    rounds:Array.from({length:rounds},(_,i)=>({number:i+1,duration:1000,winner:'CT',
      tracks:players.map((p,n)=>({player:p.id,samples:[[0,n*10,0,0,100,n===2?2:3,0],[200,n*10+10,5,0,100,n===2?2:3,0]]})),
      context:players.map((p,n)=>({player:p.id,side:n===2?2:3,result:n===2?'loss':'win',buy:['full','force','eco','pistol'][i%4],enemy_buy:'full',hero:false})),
      firing:[],utility:[],projectiles:[],deaths:[{time:500,victim:'steam:3',killer:'steam:1',victim_side:2,killer_side:3,x:10,y:0,z:0,from:[0,0,0],weapon:'ak47',headshot:false}]}))};
}
export function projected(replay,numbers,players) {
  const {rounds,...header}=replay,chosen=new Set(players);
  return {header,rounds:rounds.filter(r=>numbers.includes(r.number)).map(r=>({...r,tracks:r.tracks.filter(t=>chosen.has(t.player)),context:r.context.filter(c=>chosen.has(c.player))}))};
}
