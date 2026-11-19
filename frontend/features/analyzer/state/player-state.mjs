import { sampleIndex } from './replay.mjs';
import { weaponIconKey } from './weapon-icons.mjs';
// UI scale for the radial meter, not a rewrite/cap of captured blind durations.
export const BLINDNESS_DISPLAY_MS=5000;
export const playerAlive=(round,player,time)=>!(round.deaths||[]).some(e=>e.victim===player&&e.time<=time);
export function heldItem(round,player,time) {
  const rows=round.equipment?.find(t=>t.player===player)?.samples;
  return rows?.[sampleIndex(rows,time)]?.[1]??null;
}
export function blindRemaining(round,player,time) {
  let remaining=0;
  for(const event of round.blindness||[]){if(event.time>time)break;if(event.player===player)remaining=Math.max(remaining,event.time+event.duration-time);}
  return Math.max(0,remaining);
}
export function drawPlayerState(ctx,round,player,time,x,y,{display,icons,unit,radius}) {
  const remaining=display.blindness?blindRemaining(round,player,time):0;
  if(remaining){const ratio=Math.min(1,remaining/BLINDNESS_DISPLAY_MS),alpha=ctx.globalAlpha;
    ctx.fillStyle='#fff';ctx.globalAlpha=alpha*(.15+.6*ratio);ctx.beginPath();ctx.arc(x,y,radius+unit,0,2*Math.PI);ctx.fill();ctx.globalAlpha=alpha;
    ctx.strokeStyle='#fff';ctx.lineWidth=2*unit;ctx.beginPath();ctx.arc(x,y,radius+4*unit,-Math.PI/2,-Math.PI/2+2*Math.PI*ratio);ctx.stroke();
  }
  const item=display.items?icons[weaponIconKey(heldItem(round,player,time))]:null;
  if(item){const width=20*unit,height=11*unit,ratio=Math.min(width/item.naturalWidth,height/item.naturalHeight),dx=x+radius+3*unit,dy=y+radius+2*unit;
    ctx.fillStyle='#101a28bb';ctx.fillRect(dx-2*unit,dy-2*unit,width+4*unit,height+4*unit);ctx.drawImage(item,dx,dy,item.naturalWidth*ratio,item.naturalHeight*ratio);}
}
