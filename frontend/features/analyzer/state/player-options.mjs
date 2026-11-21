export const sortAnalyzerPlayers = (players) =>
  [...players].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) ||
      a.id.localeCompare(b.id),
  );

// Stable match-team slots survive halftime and overtime side swaps. Local/older
// captures can fall back to the first round's recorded sides, never the scrubber.
export function analyzerPlayerTeams(players, replay) {
  const teams = new Map(),
    first = replay.rounds[0];
  for (const player of players) {
    const team = replay.teams?.[player.id];
    const side =
      first?.context?.find((row) => row.player === player.id)?.side ??
      first?.tracks?.find((row) => row.player === player.id)?.samples[0]?.[5];
    teams.set(player.id, team === 0 || team === 1 ? team : side === 3 ? 0 : side === 2 ? 1 : null);
  }
  return [0, 1, null]
    .map((team) => ({
      id: team ?? 'unknown',
      label: team == null ? 'Other players' : `Team ${team + 1}`,
      players: sortAnalyzerPlayers(players.filter((player) => teams.get(player.id) === team)),
    }))
    .filter((team) => team.players.length || team.id !== 'unknown');
}
