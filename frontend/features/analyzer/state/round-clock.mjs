import { deathLabel } from './combat.mjs';
import { formatTime } from './replay.mjs';
export const DEFAULT_CLOCK = {
  round_ms: 115000,
  bomb_ms: 40000,
  round_estimated: true,
  bomb_estimated: true,
};
export function clockAt(round, time) {
  const clock = round.clock || DEFAULT_CLOCK,
    events = (round.bomb_events || []).filter(
      (e) => e.time <= (round.live_duration ?? round.duration),
    ),
    plant = events.find((e) => e.type === 'plant' && e.time <= time),
    end = events.find((e) => e.type !== 'plant' && e.time <= time);
  const activePlant = plant && plant.time <= clock.round_ms,
    now = end ? end.time : Math.min(time, round.live_duration ?? round.duration);
  const remaining = Math.max(
    0,
    activePlant ? clock.bomb_ms - (now - plant.time) : clock.round_ms - now,
  );
  return {
    remaining: end?.type === 'explode' ? 0 : remaining,
    state:
      end?.type === 'defuse'
        ? 'defused'
        : end?.type === 'explode'
          ? 'exploded'
          : round.live_duration != null && time >= round.live_duration
            ? 'ended'
            : plant
              ? 'planted'
              : 'normal',
    estimated: activePlant ? clock.bomb_estimated : clock.round_estimated,
  };
}
export function countdownText(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function roundSegments(round) {
  const events = (round.bomb_events || []).filter(
      (e) => e.time <= (round.live_duration ?? round.duration),
    ),
    plant = events.find((e) => e.type === 'plant'),
    end = events.find((e) => e.type !== 'plant'),
    segments = [];
  if (!round.duration) return [];
  if (
    round.live_duration != null &&
    round.live_duration < round.duration &&
    (!end || end.time > round.live_duration)
  ) {
    return [
      ...roundSegments({ ...round, duration: round.live_duration, live_duration: undefined }),
      { start: round.live_duration, end: round.duration, state: 'ended' },
    ];
  }
  if (!plant) return [{ start: 0, end: round.duration, state: 'normal' }];
  if (plant.time > 0) segments.push({ start: 0, end: plant.time, state: 'normal' });
  const stop = end ? end.time : round.duration;
  if (stop > plant.time) segments.push({ start: plant.time, end: stop, state: 'planted' });
  if (end && end.time < round.duration)
    segments.push({
      start: end.time,
      end: round.duration,
      state: end.type === 'defuse' ? 'defused' : 'exploded',
    });
  return segments;
}
export function timelineEvents(kills, round, players) {
  const names = new Map(players.map((p) => [p.id, p.name]));
  return [
    ...(round?.live_duration != null && round.live_duration < round.duration
      ? [
          {
            time: round.live_duration,
            kind: 'round_end',
            label: `Round ended at ${formatTime(round.live_duration)}`,
          },
        ]
      : []),
    ...kills.map((e) => ({
      time: e.time,
      kind: 'kill',
      label: `Kill at ${formatTime(e.time)} · ${deathLabel(e, names)}`,
    })),
    ...(round?.bomb_events || []).map((e) => ({
      time: e.time,
      kind: e.type,
      label: `Bomb ${{ plant: 'planted', defuse: 'defused', explode: 'exploded' }[e.type]} at ${formatTime(e.time)}${names.has(e.player) ? ` · ${names.get(e.player)}` : ''}`,
    })),
  ].sort((a, b) => a.time - b.time);
}
