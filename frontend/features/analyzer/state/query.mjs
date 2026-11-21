import { localDay } from '../../filters/state/date-range.mjs';
import { evaluate, sanitizeRules, emptyRules, condition } from '../../groups/state/rules.mjs';
import { matchesRound, roundSection, roundKey } from './round-selection.mjs';
export function rulesForPlayers(players) {
  const rules = emptyRules();
  rules.friendly.children = players.map((p) => condition(p.id));
  return rules;
}
export function analyzerMatches(matches, rules, eligible = () => true) {
  const accepts = (a, b) => evaluate(rules.friendly, a) && evaluate(rules.enemy, b);
  return matches.filter((match) => {
    if (!eligible(match)) return false;
    const a = new Set(),
      b = new Set();
    for (const player of match.players) (player.team === 0 ? a : b).add(String(player.id));
    if ([...a].some((id) => b.has(id))) return false;
    return accepts(a, b) || accepts(b, a);
  });
}
export function conditionPlayers(players, rules) {
  const included = new Set();
  function walk(node, negated = false) {
    if (node.playerId != null) {
      if (negated === Boolean(node.exclude)) included.add(String(node.playerId));
      return;
    }
    for (const child of node.children || []) walk(child, negated !== (node.op === 'none'));
  }
  walk(rules.friendly);
  walk(rules.enemy);
  return players.filter((p) => included.has(String(p.id)));
}
export function groupRoundKeys(replays, { sections = [], numbers = [] } = {}, filters = {}) {
  return replays.flatMap((replay) =>
    replay.rounds
      .filter(
        (round) =>
          (!sections.length || sections.includes(roundSection(replay, round.number).key)) &&
          (!numbers.length || numbers.includes(round.number)) &&
          matchesRound(round, filters),
      )
      .map((round) => roundKey(replay, round)),
  );
}
export function toggleChoice(selected, value) {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}
export function normalizeAnalyzerEntry(input) {
  if (input?.mode === 'match' && /^\d+$/.test(String(input.matchID)) && Number(input.matchID) > 0)
    return { mode: 'match', matchID: String(input.matchID) };
  if (input?.mode !== 'groups' || !Array.isArray(input.players)) return null;
  const ids = new Set(),
    players = input.players
      .slice(0, 20)
      .filter(
        (p) =>
          p &&
          /^\d+$/.test(String(p.id)) &&
          Number(p.id) > 0 &&
          !ids.has(String(p.id)) &&
          ids.add(String(p.id)),
      )
      .map((p) => ({
        id: String(p.id),
        name: String(p.name || 'Player').slice(0, 200),
        steam_id: /^\d{1,20}$/.test(p.steam_id) ? p.steam_id : '',
        ...(Number.isFinite(p.match_count) && p.match_count >= 0
          ? { match_count: p.match_count }
          : {}),
      }));
  if (!players.length) return null;
  const rules = sanitizeRules(
    input.rules || rulesForPlayers(players),
    players.map((p) => p.id),
  );
  return {
    mode: 'groups',
    players,
    rules,
    date: {
      from: localDay(input.date?.from) ? input.date.from : '',
      through: localDay(input.date?.through) ? input.date.through : '',
    },
    tags: Array.isArray(input.tags)
      ? input.tags
          .slice(0, 100)
          .filter(
            (row) =>
              Array.isArray(row) &&
              row.length === 2 &&
              typeof row[0] === 'string' &&
              row[0].length > 0 &&
              row[0].length <= 200 &&
              (['true', 'false', 'unknown'].includes(row[1]) ||
                (row[1] &&
                  ['gt', 'gte', 'lt', 'lte', 'eq', 'between'].includes(row[1].op) &&
                  (row[1].value === null || Number.isFinite(row[1].value)) &&
                  (row[1].max == null || Number.isFinite(row[1].max)))),
          )
      : [],
    map: typeof input.map === 'string' ? input.map.slice(0, 64) : '',
  };
}
export function analyzerRoute(input) {
  const source = normalizeAnalyzerEntry(input);
  if (!source) return '#analyzer';
  return source.mode === 'match'
    ? `#analyzer/match/${source.matchID}`
    : `#analyzer/groups?query=${encodeURIComponent(JSON.stringify(source))}`;
}
export function parseAnalyzerRoute(hash) {
  const match = /^#analyzer\/match\/(\d+)$/.exec(hash);
  if (match) return normalizeAnalyzerEntry({ mode: 'match', matchID: match[1] });
  if (!hash.startsWith('#analyzer/groups?') || hash.length > 60000) return null;
  try {
    return normalizeAnalyzerEntry(JSON.parse(new URLSearchParams(hash.split('?')[1]).get('query')));
  } catch {
    return null;
  }
}
