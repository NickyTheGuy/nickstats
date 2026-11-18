/* Optional replay capture; ordinary stats requests do not load this file. */
(() => {
  'use strict';
  const START = { hegrenade_detonate:'HE', flashbang_detonate:'Flash', smokegrenade_detonate:'Smoke', inferno_startburn:'Fire', decoy_started:'Decoy' };
  const END = { smokegrenade_expired:'Smoke', inferno_expire:'Fire', inferno_extinguish:'Fire', decoy_detonate:'Decoy' };
  const icons = { HE:'hegrenade', Flash:'flashbang', Smoke:'smokegrenade', Fire:'molotov', Decoy:'decoy' };
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
      if (!this.rounds.has(start)) this.rounds.set(start, { tracks:new Map(), firing:new Map(), deaths:[], utility:[], projectiles:new Map(), observed:new Map(), lastTick:-Infinity, lastUtilityTick:-Infinity });
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
        track.push([time,Math.round(p.x),Math.round(p.y),Math.round(p.z),Math.max(0,Math.min(100,p.health)),p.side,Number.isFinite(p.yaw)?Math.round(p.yaw):null]);
      }
    }
    combat(name,tick,start,interval,ids,readPlayers,weapon,headshot=false) {
      if (!Number.isFinite(start) || tick<start || !['weapon_fire','player_death'].includes(name)) return;
      const round=this.getRound(start),time=Math.round((tick-start)*interval*1000);
      const players=readPlayers(),byId=new Map(players.map(p=>[p.id,p]));
      for(const p of players) this.players.set(p.id,{id:p.id,name:p.name,steam_id:p.steam_id});
      function point(id) {
        const live=byId.get(id);
        if(live && [live.x,live.y,live.z].every(Number.isFinite)) return live;
        const sample=round.tracks.get(id)?.at(-1);
        return sample && time-sample[0]<=600 ? {x:sample[1],y:sample[2],z:sample[3],side:sample[5],yaw:sample[6]} : null;
      }
      if(name==='weapon_fire') {
        const shooter=point(ids.shooter);
        if(!shooter || !ids.shooter || ![2,3].includes(shooter.side))return;
        if(!round.firing.has(ids.shooter))round.firing.set(ids.shooter,[]);
        const shots=round.firing.get(ids.shooter);
        // A short burst indicator, not a ballistic simulation or a full fire-rate log.
        if(shots.length && time-shots.at(-1)[0]<100)return;
        this.countSample();
        shots.push([time,Math.round(shooter.x),Math.round(shooter.y),Math.round(shooter.z),Number.isFinite(shooter.yaw)?Math.round(shooter.yaw):null,shooter.side]);
      } else {
        const victim=point(ids.victim),killer=point(ids.killer);
        if(!victim || !ids.victim || ![2,3].includes(victim.side))return;
        if(++this.events>100000)throw new Error('Replay exceeds the combat/utility-event capture limit.');
        round.deaths.push({time,victim:ids.victim,killer:ids.killer||null,victim_side:victim.side,killer_side:killer?.side||0,
          x:Math.round(victim.x),y:Math.round(victim.y),z:Math.round(victim.z),
          from:killer?[Math.round(killer.x),Math.round(killer.y),Math.round(killer.z)]:null,
          weapon:String(weapon||'world'),headshot:Boolean(headshot)});
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
    finish(result,contexts=[]) {
      const byRound=new Map();
      for(const context of contexts) {
        if(!byRound.has(context.round))byRound.set(context.round,[]);
        byRound.get(context.round).push(context);
      }
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
        const firing=[...data.firing].map(([player,samples])=>({player:owner(player),samples:samples.filter(s=>s[0]<=duration)})).filter(t=>t.player&&t.samples.length);
        const deaths=data.deaths.filter(e=>e.time<=duration&&owner(e.victim)).map(e=>({...e,killer:owner(e.killer)}));
        const context=(byRound.get(timing.round)||[]).filter(c=>owner(c.player)).map(c=>({player:c.player,side:c.side,result:c.result,buy:c.buy,enemy_buy:c.enemy_buy,hero:Boolean(c.hero)}));
        const performance=(byRound.get(timing.round)||[]).filter(c=>owner(c.player)&&c.performance).map(c=>({player:c.player,...c.performance}));
        rounds.push({number:timing.round,duration,winner:timing.winner_side,tracks,utility,projectiles,firing,deaths,context,...(performance.length?{performance}:{})});
      }
      if (!rounds.length) throw new Error('No playable movement tracks were captured from this demo.');
      return {format:'nickstats.replay',version:4,match_uid:result.match_uid,demo_sha256:result.demo_sha256,map:result.map,source_file:result.source_file,
        sample_hz:5,projectile_hz:20,coordinate_system:'source2-world',rules:{...this.rules},players:[...this.players.values()],rounds};
    }
  }
  self.NickStatsReplayCapture = ReplayCapture;
})();
