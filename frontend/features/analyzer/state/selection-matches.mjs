import { roundRating } from './area-selection.mjs';
// Keep only the last small selection's statistics. Movement never enters here.
let cached = null,
  generation = 0;
export function selectionMatchIDs(context) {
  return [...new Set(context.matches.map((m) => String(m.id)))].sort(
    (a, b) => Number(a) - Number(b),
  );
}
export async function loadSelectionMatches(
  context,
  { signal, request = fetch, expand = (value) => value } = {},
) {
  const matches = selectionMatchIDs(context),
    ids = [...new Set(context.matches.flatMap((m) => m.players.map((p) => String(p.id))))].filter(
      (id) => /^[1-9]\d*$/.test(id),
    );
  if (!matches.length || !ids.length)
    throw Error('No saved match rosters are available for this selection.');
  const key = JSON.stringify([matches, ids.sort()]);
  if (cached?.key === key) return cached.players;
  const players = new Map(),
    revision = generation;
  for (let m = 0; m < matches.length; m += 25) {
    const matchIDs = matches.slice(m, m + 25),
      batchIDs = [
        ...new Set(
          context.matches
            .filter((row) => matchIDs.includes(String(row.id)))
            .flatMap((row) => row.players.map((p) => String(p.id))),
        ),
      ].filter((id) => ids.includes(id));
    for (let p = 0; p < batchIDs.length; p += 20) {
      const requested = batchIDs.slice(p, p + 20);
      signal?.throwIfAborted();
      const query = new URLSearchParams({
        players: requested.join(','),
        matches: matchIDs.join(','),
        wire: '4',
      });
      const response = await request(`/nickstats/api/groups?${query}`, {
          signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        }),
        body = await response.json().catch(() => null);
      if (!response.ok)
        throw Error(body?.reason || `Match statistics returned HTTP ${response.status}.`);
      const data = expand(body);
      if (!Array.isArray(data?.players)) throw Error('Invalid match statistics.');
      for (const player of data.players) {
        const id = String(player.id);
        if (!requested.includes(id) || !Array.isArray(player.matches))
          throw Error('Selection rosters changed.');
        const previous = players.get(id) || { id, label: player.name || 'Player', rows: [] },
          seen = new Set(previous.rows.map((r) => String(r.id)));
        previous.rows.push(
          ...player.matches.filter(
            (row) => matchIDs.includes(String(row.id)) && !seen.has(String(row.id)),
          ),
        );
        players.set(id, previous);
      }
    }
  }
  signal?.throwIfAborted();
  const result = [...players.values()].filter((p) => p.rows.length);
  if (generation === revision) cached = { key, players: result };
  return result;
}
export function selectedMatchTotals(context, players) {
  let kills = 0,
    deaths = 0,
    observations = 0;
  const totals = { assists: 0, damage: 0, kast: 0, played: 0 },
    results = new Map();
  for (const match of context.matches) {
    const selected = new Set(match.instances.map((i) => i.player));
    for (const actor of match.players) {
      if (!selected.has(`steam:${actor.steam_id}`)) continue;
      const row = players
        .find((p) => p.id === String(actor.id))
        ?.rows.find((r) => String(r.id) === match.id);
      if (!row) continue;
      kills += row.kills;
      deaths += row.deaths;
      observations++;
      totals.assists += row.assists;
      totals.damage += row.damage;
      totals.kast += row.kast_rounds;
      totals.played += row.rounds;
      if (['w', 'l', 'n'].includes(row.result))
        results.set(`${match.id}:${actor.team}`, row.result);
    }
  }
  const complete =
    observations > 0 &&
    observations ===
      new Set(
        context.matches.flatMap((m) =>
          m.instances.filter((i) => i.player).map((i) => `${m.id}:${i.player}`),
        ),
      ).size;
  const values = [...results.values()];
  return {
    kills,
    deaths,
    observations,
    combatComplete: complete,
    rating: complete ? roundRating({ ...totals, kills, deaths }) : null,
    winRate: values.length ? (100 * values.filter((r) => r === 'w').length) / values.length : null,
    utility: { count: 0, metrics: [] },
  };
}
if (typeof window !== 'undefined')
  window.addEventListener('nickstats:matches-changed', () => {
    generation++;
    cached = null;
  });
