/* Optional replay capture. No tracks are allocated during ordinary stats parsing. */
(() => {
  'use strict';
  const TYPES = Object.freeze({ hegrenade_detonate: 'HE', flashbang_detonate: 'Flash',
    smokegrenade_detonate: 'Smoke', inferno_startburn: 'Fire', decoy_started: 'Decoy' });
  class ReplayCapture {
    constructor() { this.reset(); }
    reset() { this.rounds = new Map(); this.players = new Map(); this.samples = 0; this.events = 0; }
    getRound(start) {
      if (!this.rounds.has(start)) {
        if (this.rounds.size >= 256) throw new Error('Replay exceeds the 256-round capture limit.');
        this.rounds.set(start, { tracks: new Map(), utility: [], lastTick: -Infinity });
      }
      return this.rounds.get(start);
    }
    sample(tick, start, interval, readPlayers) {
      if (!Number.isFinite(start) || tick < start) return;
      const round = this.getRound(start);
      if ((tick - round.lastTick) * interval < 0.2) return;
      round.lastTick = tick;
      const time = Math.round((tick - start) * interval * 1000);
      for (const player of readPlayers()) {
        if (++this.samples > 1000000) throw new Error('Replay exceeds the one-million-position capture limit.');
        const { id, name, steam_id, x, y, z, health, side } = player;
        if (![x, y, z, health].every(Number.isFinite) || ![2, 3].includes(side)) continue;
        this.players.set(id, { id, name, steam_id });
        if (!round.tracks.has(id)) round.tracks.set(id, []);
        const track = round.tracks.get(id);
        if (track.at(-1)?.[0] === time) continue;
        // Retain a terminal dead sample, but not the corpse for the rest of the round.
        if (track.at(-1)?.[4] === 0 && health === 0) continue;
        track.push([time, Math.round(x), Math.round(y), Math.round(z), Math.max(0, Math.min(100, health)), side]);
      }
    }
    utility(name, tick, start, interval, event, owner) {
      if (!TYPES[name] || !Number.isFinite(start) || tick < start) return;
      const { x, y, z } = event;
      if (![x, y, z].every(v => typeof v === 'number' && Number.isFinite(v))) return;
      if (++this.events > 100000) throw new Error('Replay exceeds the utility-event capture limit.');
      this.getRound(start).utility.push({ time: Math.round((tick - start) * interval * 1000),
        type: TYPES[name], player: owner || null, x: Math.round(x), y: Math.round(y), z: Math.round(z) });
    }
    finish(result) {
      const rounds = [];
      for (const timing of result.round_timing) {
        const data = this.rounds.get(timing.live_start_tick);
        if (!data) continue;
        const tracks = [...data.tracks].map(([player, samples]) => ({ player,
          samples: samples.filter(s => s[0] <= timing.duration_ms) })).filter(t => t.samples.length);
        if (!tracks.length) continue;
        rounds.push({ number: timing.round, duration: timing.duration_ms, winner: timing.winner_side,
          tracks, utility: data.utility.filter(e => e.time <= timing.duration_ms).map(e => ({ ...e, player: this.players.has(e.player) ? e.player : null })).sort((a, b) => a.time - b.time) });
      }
      if (!rounds.length) throw new Error('No playable movement tracks were captured from this demo.');
      return { format: 'nickstats.replay', version: 1, match_uid: result.match_uid, map: result.map,
        source_file: result.source_file, sample_hz: 5, coordinate_system: 'source2-world',
        players: [...this.players.values()], rounds };
    }
  }
  self.NickStatsReplayCapture = ReplayCapture;
})();
