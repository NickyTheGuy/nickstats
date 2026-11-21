import { sampleIndex } from './replay.mjs';
export const UTILITY_COLORS = {
  Smoke: '#dce3ee',
  Flash: '#fff48c',
  HE: '#ff6b59',
  Fire: '#ffad46',
  Decoy: '#c496ff',
};
export const UTILITY_ICONS = {
  Smoke: 'smokegrenade',
  Flash: 'flashbang',
  HE: 'hegrenade',
  Fire: 'molotov',
  Decoy: 'decoy',
};
const defaults = { Smoke: 20000, Fire: 7000, Decoy: 15000, HE: 1000, Flash: 1000 };
export function effectEnd(effect, duration) {
  return Math.min(duration, effect.end ?? effect.time + defaults[effect.type]);
}
export function utilityVisible(item, round, selected, side) {
  if (item.player ? !selected.has(item.player) : !selected.size) return false;
  if (!side) return true;
  if (item.side) return item.side === side;
  const samples = round.tracks.find((t) => t.player === item.player)?.samples;
  return (
    !!samples &&
    samples[sampleIndex(samples, item.time ?? item.samples?.[0]?.[0] ?? 0)]?.[5] === side
  );
}
export function projectilePosition(projectile, time) {
  const samples = projectile.samples,
    index = sampleIndex(samples, time),
    a = samples[index],
    b = samples[index + 1];
  if (!a || time >= projectile.end || time - a[0] > 150) return null;
  if (!b || b[0] - a[0] > 150) return a;
  const ratio = (time - a[0]) / (b[0] - a[0]);
  return [time, ...a.slice(1).map((v, i) => v + (b[i + 1] - v) * ratio)];
}
