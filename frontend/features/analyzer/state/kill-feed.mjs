import { roundChannels } from './display.mjs';
export function roundCombat(round,options) {
  const channels=roundChannels(round,options),kills=[],feed=[];
  for(const event of round.deaths||[]) {
    const enemy=event.killer&&event.killer!==event.victim&&event.killer_side!==event.victim_side;
    const kill=enemy&&channels.some(c=>c.ids.has(event.killer)&&(!c.side||c.side===event.killer_side)&&c.display.combat.includes('Kills'));
    const death=channels.some(c=>c.ids.has(event.victim)&&(!c.side||c.side===event.victim_side)&&c.display.combat.includes('Deaths'));
    if(kill)kills.push(event);if(kill||death)feed.push(event);
  }
  return {kills,feed};
}
export function feedRows(events,time,startTime=0) {
  return events.filter(event=>event.time>=startTime&&event.time<=time&&time-event.time<6000).slice(-6).map(event=>({event,opacity:Math.min(1,(6000-time+event.time)/1500)}));
}
