import { onLevel, sampleIndex, worldToRadar } from './replay.mjs';
export const COMBAT_LAYERS=['Deaths','Aim','Gunfire'];
export function aimVector(yaw,length=32) {
  const angle=yaw*Math.PI/180;return [Math.cos(angle)*length,-Math.sin(angle)*length];
}
export function deathVisible(event,selected,side) {
  return selected.has(event.victim)&&(!side||event.victim_side===side)||selected.has(event.killer)&&(!side||event.killer_side===side);
}
export function drawAim(ctx,point,x,y,color) {
  if(!Number.isFinite(point[6]))return;
  const [dx,dy]=aimVector(point[6]);
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();
}
function skull(ctx,x,y,fill,outline) {
  ctx.fillStyle=fill;ctx.strokeStyle=outline;ctx.lineWidth=2.5;
  ctx.beginPath();ctx.arc(x,y-3,8,Math.PI,0);ctx.lineTo(x+7,y+4);ctx.lineTo(x+4,y+5);ctx.lineTo(x+4,y+10);ctx.lineTo(x-4,y+10);ctx.lineTo(x-4,y+5);ctx.lineTo(x-7,y+4);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#101620';
  for(const dx of [-3,3]){ctx.beginPath();ctx.arc(x+dx,y-1,2,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#101620';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+5);ctx.lineTo(x,y+10);ctx.stroke();
}
export function drawCombat(ctx,round,{time,map,level,selected,side,colors,names,layers}) {
  if(layers.includes('Gunfire'))for(const track of round.firing||[]) {
    if(!selected.has(track.player))continue;
    const s=track.samples[sampleIndex(track.samples,time)];
    if(!s||time-s[0]>140||!onLevel(level,s[3])||side&&side!==s[5])continue;
    const [x,y]=worldToRadar(map,s[1],s[2]),color=colors.get(track.player)||'#fff';
    ctx.strokeStyle=color;ctx.lineWidth=2;
    if(s[4]!==null){const [dx,dy]=aimVector(s[4],65);ctx.beginPath();ctx.moveTo(x+dx*0.2,y+dy*0.2);ctx.lineTo(x+dx,y+dy);ctx.stroke();}
    ctx.fillStyle='#fff3b0';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
  }
  if(!layers.includes('Deaths'))return;
  for(const e of round.deaths||[]) {
    if(e.time>time)break;
    if(!onLevel(level,e.z)||!deathVisible(e,selected,side))continue;
    const [x,y]=worldToRadar(map,e.x,e.y),victim=colors.get(e.victim)||'#fff',killer=colors.get(e.killer)||'#cad2de';
    if(time-e.time<450&&e.from&&e.killer!==e.victim&&onLevel(level,e.from[2])) {
      const from=worldToRadar(map,e.from[0],e.from[1]);ctx.strokeStyle=killer;ctx.lineWidth=1.5;
      ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
    }
    skull(ctx,x,y,victim,killer);
    const victimName=names.get(e.victim)||'Unknown',killerName=names.get(e.killer);
    const label=e.killer===e.victim?`${victimName} · suicide`:killerName?`${killerName} → ${victimName}`:`${victimName} · ${e.weapon==='world'?'world':e.weapon}`;
    ctx.font='bold 11px system-ui';ctx.strokeStyle='#101620';ctx.lineWidth=3;ctx.strokeText(label,x+12,y+3);ctx.fillStyle='#eef3fa';ctx.fillText(label,x+12,y+3);
  }
}
