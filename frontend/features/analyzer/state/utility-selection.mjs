// Filtering to another player roster can renumber an effect array. Keep a
// deterministic identity within its owner/round, including coincident throws.
export function utilityKeys(round) {
  const counts = new Map();
  return round.utility.map((e) => {
    const signature = JSON.stringify([e.player, e.type, e.time, e.x, e.y, e.z]),
      ordinal = counts.get(signature) || 0;
    counts.set(signature, ordinal + 1);
    return `${signature}:${ordinal}`;
  });
}

const cache = new WeakMap(),
  emptyFlights = [];
// Existing captures have trajectories and effects, but no explicit relationship.
// Link only a mutually unique same-owner/type landing near the trajectory end.
// Ambiguous or missing effects retain a selectable projectile with unknown yield.
export function utilitySelectionData(round) {
  const utility = round.utility,
    flights = round.projectiles || emptyFlights,
    old = cache.get(round);
  if (old?.utility === utility && old.flights === flights) return old;
  const keys = utilityKeys(round),
    effectsByKey = new Map(keys.map((key, i) => [key, utility[i]])),
    buckets = new Map(),
    claims = new Map();
  utility.forEach((effect, index) => {
    const key = JSON.stringify([effect.player, effect.type]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ effect, index });
  });
  const candidates = flights.map((projectile) => {
    const last = projectile.samples.at(-1),
      first = projectile.samples[0];
    const matches = (
      buckets.get(JSON.stringify([projectile.player, projectile.type])) || []
    ).filter(
      ({ effect }) =>
        effect.time >= first[0] &&
        Math.abs(effect.time - projectile.end) <= 500 &&
        Math.hypot(effect.x - last[1], effect.y - last[2], effect.z - last[3]) <= 256,
    );
    for (const { index } of matches) claims.set(index, (claims.get(index) || 0) + 1);
    return matches;
  });
  const projectiles = flights.map((projectile, i) => {
    const match =
      candidates[i].length === 1 && claims.get(candidates[i][0].index) === 1
        ? candidates[i][0]
        : null;
    const key = match ? keys[match.index] : `projectile:${projectile.id}`,
      point = projectile.samples.at(-1);
    const effect = match?.effect || {
      type: projectile.type,
      icon: projectile.icon,
      player: projectile.player,
      side: projectile.side,
      time: projectile.samples[0][0],
      x: point[1],
      y: point[2],
      z: point[3],
      unlinked_projectile: true,
    };
    effectsByKey.set(key, effect);
    return { projectile, effect, key };
  });
  const result = { utility, flights, keys, effectsByKey, projectiles };
  cache.set(round, result);
  return result;
}
