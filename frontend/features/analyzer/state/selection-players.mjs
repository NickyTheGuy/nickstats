import { summarizeArea } from './area-selection.mjs';
export const playerTabKey = (player) => (player === null ? 'unknown' : player);
export function selectionPlayerOptions(summary, players) {
  const names = new Map(players.map((player) => [player.id, player.name]));
  return [
    ['combined', 'Combined'],
    ...[...new Set(summary.instances.map((item) => item.player))].map((player) => [
      playerTabKey(player),
      player === null ? 'Unknown thrower' : names.get(player) || player,
    ]),
  ];
}
export function playerSelection(rounds, items, summary, player = 'combined') {
  const allowed = new Set(
    summary.instances.map((item) => JSON.stringify([item.roundKey, item.player])),
  );
  const selected = items.filter(
    (item) =>
      allowed.has(JSON.stringify([item.roundKey, item.player])) &&
      (player === 'combined' || playerTabKey(item.player) === player),
  );
  return {
    items: selected,
    summary:
      player === 'combined'
        ? summary
        : summarizeArea(rounds, {
            players: [...new Set(selected.map((item) => item.player).filter(Boolean))],
            selection: selected,
          }),
  };
}
