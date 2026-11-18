/* Optional replay capture; ordinary stats requests do not load this file. */
(() => {
  'use strict';
  const START = { hegrenade_detonate:'HE', flashbang_detonate:'Flash', smokegrenade_detonate:'Smoke', inferno_startburn:'Fire', decoy_started:'Decoy' };
  const END = { smokegrenade_expired:'Smoke', inferno_expire:'Fire', inferno_extinguish:'Fire', decoy_detonate:'Decoy' };
  const icons = { HE:'hegrenade', Flash:'flashbang', Smoke:'smokegrenade', Fire:'molotov', Decoy:'decoy' };
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  class ReplayCapture {
    constructor() {
      this.rules = { regulation_rounds:24, overtime_rounds:6 };
      this.lifetimes = { Smoke:20000, Fire:7000, Incendiary:5500, Decoy:15000, HE:1000, Flash:1000 };
      this.reset();
    }
    reset() { this.rounds = new Map(); this.players = new Map(); this.samples = 0; this.events = 0; }
    configure(name,value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return;
      if (name === 'mp_maxrounds') this.rules.regulation_rounds = Math.round(n);
      if (name === 'mp_overtime_maxrounds') this.rules.overtime_rounds = Math.round(n);
      const key = { smokegrenade_lifetime:'Smoke', inferno_flame_lifetime:'Fire', inferno_flame_lifetime_incendiary:'Incendiary' }[name];
      if (key) this.lifetimes[key] = n*1000;
    }
    getRound(start) {
      if (!this.rounds.has(start)) this.rounds.set(start, { tracks:new Map(), utility:[], projectiles:new Map(), observed:new Map(), lastTick:-Infinity, lastUtilityTick:-Infinity });
      return this.rounds.get(start);
    }
    countSample() { if (++this.samples > 1000000) throw new Error('Replay exceeds the one-million-position capture limit.'); }
    sample(tick,start,interval,readPlayers) {
      if (!Number.isFinite(start) || tick < start) return;
      const round = this.getRound(start);
      if ((tick-round.lastTick)*interval < 0.2) return;
      round.lastTick = tick;
      const time = Math.round((tick-start)*interval*1000);
      for (const p of readPlayers()) {
        if (![p.x,p.y,p.z,p.health].every(Number.isFinite) || ![2,3].includes(p.side)) continue;
        this.players.set(p.id,{ id:p.id,name:p.name,steam_id:p.steam_id });
        if (!round.tracks.has(p.id)) round.tracks.set(p.id,[]);
        const track = round.tracks.get(p.id), last = track.at(-1);
        if (last?.[0] === time || last?.[4] === 0 && p.health === 0) continue;
        this.countSample();
        track.push([time,Math.round(p.x),Math.round(p.y),Math.round(p.z),Math.max(0,Math.min(100,p.health)),p.side]);
      }
    }
    effect(round,time,info) {
      let effect = round.utility.find(e => e.type === info.type && e._entity === info.entity && e.end === null);
      if (!effect) {
        if (++this.events > 100000) throw new Error('Replay exceeds the utility-event capture limit.');
        effect = { time,end:null,type:info.type,player:info.player||null,side:info.side||0,
          x:Math.round(info.x),y:Math.round(info.y),z:Math.round(info.z),icon:info.icon||icons[info.type],
          radius:info.type==='Smoke'?144:info.type==='Fire'?120:0,estimated:true,_entity:info.entity };
        round.utility.push(effect);
      }
      if (info.player) effect.player = info.player;
      if (info.side) effect.side = info.side;
      if (info.icon) effect.icon = info.icon;
      if (info.radius) effect.radius = info.radius;
      return effect;
    }
    utility(name,tick,start,interval,event,owner) {
      if (!Number.isFinite(start) || tick < start || !START[name] && !END[name]) return;
      const round = this.getRound(start), time = Math.round((tick-start)*interval*1000), type = START[name]||END[name];
      if (END[name]) {
        for (const effect of round.utility) if (effect.type === type && effect._entity === event.entityid && effect.end === null) {
          effect.end = Math.max(effect.time,time); effect.estimated = false;
        }
        return;
      }
      if (![event.x,event.y,event.z].every(Number.isFinite)) return;
      this.effect(round,time,{...event,entity:event.entityid,type,player:owner});
    }
    observe(tick,start,interval,readEntities) {
      if (!Number.isFinite(start) || tick < start) return;
      const round = this.getRound(start);
      if ((tick-round.lastUtilityTick)*interval < 0.05) return;
      round.lastUtilityTick = tick;
      const time = Math.round((tick-start)*interval*1000), active = new Set();
      for (const info of readEntities()) {
        if (![info.x,info.y,info.z].every(Number.isFinite)) continue;
        if (info.effect) {
          const key = `effect:${info.id}`; active.add(key);
          let effect = round.observed.get(key);
          if (!effect) {
            effect = round.utility.find(e=>e.type===info.type && e._entity===info.entity && e.end!==null && time-e.end<=250);
            if (effect) round.observed.set(key,effect);
          }
          if (!effect && info.active !== false) {
            const began = Number.isFinite(info.beginTick) && info.beginTick >= start && info.beginTick <= tick
              ? Math.round((info.beginTick-start)*interval*1000) : time;
            effect = this.effect(round,began,info); round.observed.set(key,effect);
          }
          if (effect) {
            if (info.player) effect.player = info.player;
            if (info.side) effect.side = info.side;
            if (info.radius) effect.radius = Math.max(effect.radius,info.radius);
            if (info.icon) effect.icon = info.icon;
            if (info.active === false && effect.end === null) { effect.end = time; effect.estimated = false; }
          }
        } else {
          const key = String(info.id); active.add(key);
          let projectile = round.projectiles.get(key);
          if (!projectile) {
            projectile = { id:key,type:info.type,icon:info.icon||icons[info.type],player:info.player||null,side:info.side||0,samples:[],end:null };
            round.projectiles.set(key,projectile);
          }
          if (projectile.end !== null) continue;
          if (info.player) projectile.player = info.player;
          if (info.side) projectile.side = info.side;
          if (projectile.samples.at(-1)?.[0] === time) continue;
          this.countSample(); projectile.samples.push([time,Math.round(info.x),Math.round(info.y),Math.round(info.z)]);
        }
      }
      for (const [key,effect] of round.observed) if (!active.has(key) && effect.end === null) {
        // An inferno entity may outlive its flames. Without burning flags/expiry,
        // bound its lifetime rather than treating late entity deletion as flame-out.
        effect.end = effect.type==='Fire' ? Math.min(time,effect.time+this.lifetimes[effect.icon==='incgrenade'?'Incendiary':'Fire']) : time;
        effect.estimated = effect.type==='Fire';
      }
      for (const [key,projectile] of round.projectiles) if (!active.has(key) && projectile.end === null) projectile.end = time;
    }
    finish(result) {
      const rounds = [], owner = id => this.players.has(id)?id:null;
      for (const timing of result.round_timing) {
        const data = this.rounds.get(timing.live_start_tick);
        if (!data) continue;
        const duration = timing.duration_ms;
        const tracks = [...data.tracks].map(([player,samples])=>({player,samples:samples.filter(s=>s[0]<=duration)})).filter(t=>t.samples.length);
        if (!tracks.length) continue;
        const utility = data.utility.filter(e=>e.time<=duration).map(({_entity,...e})=>({ ...e,player:owner(e.player),
          end:Math.min(duration,e.end??e.time+(this.lifetimes[e.icon==='incgrenade'?'Incendiary':e.type]||1000)) })).sort((a,b)=>a.time-b.time);
        const projectiles = [...data.projectiles.values()].map(p=>({...p,player:owner(p.player),samples:p.samples.filter(s=>s[0]<=duration),
          end:Math.min(duration,p.end??duration)})).filter(p=>p.samples.length);
        rounds.push({number:timing.round,duration,winner:timing.winner_side,tracks,utility,projectiles});
      }
      if (!rounds.length) throw new Error('No playable movement tracks were captured from this demo.');
      return {format:'nickstats.replay',version:2,match_uid:result.match_uid,map:result.map,source_file:result.source_file,
        sample_hz:5,projectile_hz:20,coordinate_system:'source2-world',rules:{...this.rules},players:[...this.players.values()],rounds};
    }
  }
  self.NickStatsReplayCapture = ReplayCapture;
})();
