import { onLevel,positionAt,worldToRadar } from './replay.mjs';

// Canvas object-fit:contain leaves letterboxing. Both selection and map drawing
// use the square's center/scale, then undo pan and zoom in radar coordinates.
export function pointerToRadar(point,rect,view) {
  const scale=Math.min(rect.width,rect.height)/1024;
  if(!scale)return null;
  return {x:512+((point.x-rect.left-rect.width/2)/scale-view.x)/view.zoom,
    y:512+((point.y-rect.top-rect.height/2)/scale-view.y)/view.zoom};
}
export function areaBounds(a,b) {
  if(!a||!b)return null;
  const left=Math.max(0,Math.min(a.x,b.x)),right=Math.min(1024,Math.max(a.x,b.x));
  const top=Math.max(0,Math.min(a.y,b.y)),bottom=Math.min(1024,Math.max(a.y,b.y));
  return right>left&&bottom>top?{left,right,top,bottom}:null;
}
export function areaOnScreen(area,size,view) {
  const scale=Math.min(size.width,size.height)/1024;
  return {left:size.width/2+((area.left-512)*view.zoom+view.x)*scale,
    top:size.height/2+((area.top-512)*view.zoom+view.y)*scale,
    width:(area.right-area.left)*view.zoom*scale,height:(area.bottom-area.top)*view.zoom*scale};
}
const inside=(box,x,y)=>x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom;
function killsFor(round,player) {
  return (round.deaths||[]).filter(e=>e.killer===player&&e.victim!==player&&e.killer_side!==e.victim_side).length;
}
export function roundRating({kills,deaths,assists,damage,kast,played}) {
  if(!played)return null;
  const kpr=kills/played,dpr=deaths/played,apr=assists/played,adr=damage/played;
  return Math.max(0,.0073*100*kast/played+.3591*kpr-.5329*dpr+.2372*(2.13*kpr+.42*apr-.41)+.0032*adr+.1587);
}
export function summarizeArea(rounds,{area,map,level,time,players,side=0}) {
  const selected=new Set(players),matched=new Set(),observations=[];
  for(const round of rounds) {
    if(time>round.duration)continue;
    for(const track of round.tracks) {
      if(!selected.has(track.player))continue;
      const point=positionAt(track.samples,time);
      if(!point||!onLevel(level,point[3])||side&&point[5]!==side)continue;
      const [x,y]=worldToRadar(map,point[1],point[2]);if(!inside(area,x,y))continue;
      matched.add(round);
      const context=round.context?.find(c=>c.player===track.player),performance=round.performance?.find(p=>p.player===track.player);
      const result=context?.result||(round.winner?((point[5]===2?'T':'CT')===round.winner?'win':'loss'):null);
      observations.push({round,player:track.player,result,performance});
    }
  }
  const totals={kills:0,deaths:0,assists:0,damage:0,kast:0,played:observations.length};let wins=0,known=0,complete=true,combatComplete=true;
  for(const row of observations) {
    if(row.result){known++;wins+=Number(row.result==='win');}
    const p=row.performance;
    if(!p&&!Array.isArray(row.round.deaths))combatComplete=false;
    totals.kills+=p?.kills??killsFor(row.round,row.player);
    totals.deaths+=p?.deaths??(row.round.deaths||[]).filter(e=>e.victim===row.player).length;
    if(!p)complete=false;else{totals.assists+=p.assists;totals.damage+=p.damage;totals.kast+=p.kast;}
  }
  return {matched,total:rounds.length,count:matched.size,percent:rounds.length?100*matched.size/rounds.length:0,
    observations:observations.length,winRate:known?100*wins/known:null,knownResults:known,
    ...totals,combatComplete,rating:complete?roundRating(totals):null};
}
