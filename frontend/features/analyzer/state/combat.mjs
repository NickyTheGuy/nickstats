import { onLevel, sampleIndex, worldToRadar } from './replay.mjs';
import { weaponIconKey } from './weapon-icons.mjs';
export const COMBAT_LAYERS=['Kills','Deaths','Aim','Gunfire'];
export function aimVector(yaw,length=32) {
  const angle=yaw*Math.PI/180;return [Math.cos(angle)*length,-Math.sin(angle)*length];
}
export function deathVisible(event,selected,side) {
  return selected.has(event.victim)&&(!side||event.victim_side===side);
}
export function deathLabel(event,names) {
  const victim=names.get(event.victim)||'Unknown',killer=names.get(event.killer);
  return event.killer===event.victim?`${victim} · suicide`:killer?`${killer} → ${victim}${event.killer_side&&event.killer_side===event.victim_side?' · team kill':''}`:`${victim} · ${event.weapon==='world'?'world':event.weapon}`;
}
// Perspective is explicit: kills belong to selected killers; deaths to selected victims.
// A kill is located at the killer's recorded position, a death at the victim's.
export function combatMarkers(event,{selected,side,layers,map,level,unit=1,preferredRole=null}) {
  const marks=[],enemy=event.killer&&event.killer!==event.victim&&!(event.killer_side&&event.killer_side===event.victim_side);
  if(enemy&&event.from&&layers.includes('Kills')&&selected.has(event.killer)&&(!side||event.killer_side===side)&&onLevel(level,event.from[2])) {
    const [x,y]=worldToRadar(map,event.from[0],event.from[1]);marks.push({kind:'kill',actor:event.killer,x,y,baseX:x,baseY:y,event});
  }
  if(layers.includes('Deaths')&&deathVisible(event,selected,side)&&onLevel(level,event.z)) {
    const [x,y]=worldToRadar(map,event.x,event.y);marks.push({kind:'death',actor:event.victim,x,y,baseX:x,baseY:y,event});
  }
  if(!preferredRole&&marks.length===2&&Math.hypot(marks[0].x-marks[1].x,marks[0].y-marks[1].y)<40*unit) {
    marks[0].x-=18*unit;marks[1].x+=18*unit;
  }
  if(preferredRole)marks.sort((a,b)=>Number(a.kind===preferredRole)-Number(b.kind===preferredRole));
  return marks;
}
export function drawAim(ctx,point,x,y,color) {
  if(!Number.isFinite(point[6]))return;
  const [dx,dy]=aimVector(point[6]);
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();
}
function skull(ctx,fill) {
  ctx.fillStyle=fill;ctx.strokeStyle='#eef3fa';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(0,-3,8,Math.PI,0);ctx.lineTo(7,4);ctx.lineTo(4,5);ctx.lineTo(4,10);ctx.lineTo(-4,10);ctx.lineTo(-4,5);ctx.lineTo(-7,4);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#101620';
  for(const dx of [-3,3]){ctx.beginPath();ctx.arc(dx,-1,2,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#101620';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,5);ctx.lineTo(0,10);ctx.stroke();
}
function killBadge(ctx,color,icon) {
  ctx.fillStyle='#101a28';ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(-18,-11,36,22,4);ctx.fill();ctx.stroke();
  if(icon) {
    const ratio=Math.min(30/icon.naturalWidth,16/icon.naturalHeight);
    ctx.drawImage(icon,-icon.naturalWidth*ratio/2,-icon.naturalHeight*ratio/2,icon.naturalWidth*ratio,icon.naturalHeight*ratio);
  } else {
    // Unsupported weapons retain a distinct kill shape, never a fake headshot icon.
    ctx.strokeStyle='#eef3fa';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);
    ctx.moveTo(-9,0);ctx.lineTo(9,0);ctx.moveTo(0,-8);ctx.lineTo(0,8);ctx.stroke();
  }
}
export function drawCombat(ctx,round,{time,map,level,selected,side,colors,layers,icons={},unit=1,preferredRole=null}) {
  if(layers.includes('Gunfire'))for(const track of round.firing||[]) {
    if(!selected.has(track.player))continue;
    const s=track.samples[sampleIndex(track.samples,time)];
    if(!s||time-s[0]>140||!onLevel(level,s[3])||side&&side!==s[5])continue;
    const [x,y]=worldToRadar(map,s[1],s[2]),color=colors.get(track.player)||'#fff';
    ctx.strokeStyle=color;ctx.lineWidth=2;
    if(s[4]!==null){const [dx,dy]=aimVector(s[4],65);ctx.beginPath();ctx.moveTo(x+dx*0.2,y+dy*0.2);ctx.lineTo(x+dx,y+dy);ctx.stroke();}
    ctx.fillStyle='#fff3b0';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
  }
  for(const e of round.deaths||[]) {
    if(e.time>time)break;
    const marks=combatMarkers(e,{selected,side,layers,map,level,unit,preferredRole});
    if(marks.length&&time-e.time<450&&e.from&&e.killer!==e.victim&&onLevel(level,e.from[2])&&onLevel(level,e.z)) {
      const from=worldToRadar(map,e.from[0],e.from[1]),to=worldToRadar(map,e.x,e.y);ctx.strokeStyle=colors.get(e.killer)||'#fff';ctx.lineWidth=1.5;
      ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.stroke();ctx.setLineDash([]);
    }
    for(const mark of marks) {
      if(mark.x!==mark.baseX||mark.y!==mark.baseY) {
        ctx.strokeStyle='#b2bfd2';ctx.lineWidth=unit;ctx.beginPath();ctx.moveTo(mark.baseX,mark.baseY);ctx.lineTo(mark.x,mark.y);ctx.stroke();
      }
      ctx.save();ctx.translate(mark.x,mark.y);ctx.scale(unit,unit);
      const color=colors.get(mark.actor)||'#eef3fa';
      if(mark.kind==='kill')killBadge(ctx,color,icons[weaponIconKey(e.weapon)]);else skull(ctx,color);
      ctx.restore();
    }
  }
}
