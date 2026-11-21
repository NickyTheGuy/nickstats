import { selectionRoundKey } from './selection-targets.mjs';

// Opponents are resolved for each round, so side swaps, substitutes and groups
// containing players on both teams do not turn into a global enemy roster.
export function roundRoster(
  replay,
  round,
  players,
  { enemies = false, focus = null, side = 0 } = {},
) {
  const available = new Set(replay.players.map((p) => p.id));
  const sides = new Map(
    (round.context || [])
      .filter((c) => c.side === 2 || c.side === 3)
      .map((c) => [c.player, c.side]),
  );
  for (const track of round.tracks || [])
    if (!sides.has(track.player)) {
      const side = track.samples.find((s) => s[5] === 2 || s[5] === 3)?.[5];
      if (side) sides.set(track.player, side);
    }
  const primary = players.filter(
    (id) => available.has(id) && (!side || !sides.has(id) || sides.get(id) === side),
  );
  const chosen = focus?.get(selectionRoundKey({ ...round, match_uid: replay.match_uid }));
  const focused = focus && !chosen?.has(null) ? primary.filter((id) => chosen?.has(id)) : primary;
  const reference = focused.length ? focused : primary;
  const enemy = enemies
    ? replay.players
        .filter(
          (p) =>
            !focused.includes(p.id) &&
            reference.some((id) =>
              sides.has(id) && sides.has(p.id)
                ? sides.get(id) !== sides.get(p.id)
                : replay.teams?.[id] != null &&
                  replay.teams?.[p.id] != null &&
                  replay.teams[id] !== replay.teams[p.id],
            ),
        )
        .map((p) => p.id)
    : [];
  return { primary: focused, enemies: enemy };
}
export function instanceFocus(instances) {
  const result = new Map();
  for (const item of instances) {
    if (!result.has(item.roundKey)) result.set(item.roundKey, new Set());
    result.get(item.roundKey).add(item.player);
  }
  return result;
}
export function rosterIndex(replays, players, options) {
  return new Map(
    replays.flatMap((replay) =>
      replay.rounds.map((round) => [
        `${replay.match_uid}:${round.number}`,
        roundRoster(replay, round, players, options),
      ]),
    ),
  );
}
export const rosterPlayers = (roster) => [...roster.primary, ...roster.enemies];
