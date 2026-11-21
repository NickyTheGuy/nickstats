export const MAX_RULE_NODES = 200;
export const MAX_RULE_DEPTH = 6;
let sequence = 0;
const id = () => `rule-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++sequence}`}`;
export const group = (op = 'and', children = []) => ({ id: id(), op, children });
export const condition = (playerId, exclude = false) => ({
  id: id(),
  playerId: String(playerId),
  exclude,
});
export const emptyRules = () => ({ friendly: group(), enemy: group() });
export const countNodes = (node) =>
  1 + (node.children || []).reduce((n, child) => n + countNodes(child), 0);
export const active = (node) => Boolean(node?.playerId) || (node?.children || []).some(active);

// Bound saved/untrusted trees and keep stable keys for the controlled React UI.
export function sanitizeRules(value, playerIds) {
  const allowed = new Set([...playerIds].map(String)),
    seen = new Set();
  let remaining = MAX_RULE_NODES - 2;
  function clean(node, depth) {
    if (
      !node ||
      typeof node !== 'object' ||
      depth > MAX_RULE_DEPTH ||
      (depth > 0 && remaining-- <= 0)
    )
      return null;
    let key = typeof node.id === 'string' && !seen.has(node.id) ? node.id : id();
    seen.add(key);
    if (node.playerId != null)
      return allowed.has(String(node.playerId))
        ? { id: key, playerId: String(node.playerId), exclude: node.exclude === true }
        : null;
    const op = ['and', 'or', 'xor', 'none'].includes(node.op) ? node.op : 'and';
    return {
      id: key,
      op,
      children: (Array.isArray(node.children) ? node.children : [])
        .map((child) => clean(child, depth + 1))
        .filter(Boolean),
    };
  }
  const friendly = clean(value?.friendly, 0),
    enemy = clean(value?.enemy, 0);
  return {
    friendly: friendly?.children ? friendly : group(),
    enemy: enemy?.children ? enemy : group(),
  };
}

export function legacyRules(rows) {
  return {
    friendly: group(
      'and',
      rows.map((row) => condition(row.player.id, row.choice === 'exclude')),
    ),
    enemy: group(),
  };
}

export function evaluate(node, roster) {
  if (node.playerId != null) return roster.has(String(node.playerId)) !== Boolean(node.exclude);
  const children = (node.children || []).filter(active);
  // Empty branches are inactive, including inside OR/XOR/NONE.
  if (!children.length) return true;
  if (node.op === 'and') return children.every((child) => evaluate(child, roster));
  if (node.op === 'or') return children.some((child) => evaluate(child, roster));
  if (node.op === 'none') return !children.some((child) => evaluate(child, roster));
  let matches = 0;
  for (const child of children) {
    if (evaluate(child, roster) && ++matches > 1) return false;
  }
  return matches === 1; // Exactly one, not odd parity.
}

// Build one union of observed matches, then test both team orientations. A row's
// teammate IDs include the whole known roster, not just selected/profile players.
export function qualifyingMatches(players, rules, eligible = () => true) {
  const matches = new Map();
  for (const player of players) {
    for (const row of player.rows) {
      if (!eligible(row)) continue;
      let match = matches.get(row.id);
      if (!match) {
        match = { id: row.id, rows: [] };
        matches.set(row.id, match);
      }
      if (!match.rows.some((item) => item.player.profileId === player.profileId))
        match.rows.push({ player, row });
    }
  }
  const result = [];
  for (const match of matches.values()) {
    const first = match.rows[0];
    const a = new Set([first.player.profileId, ...(first.row.teammateIds || [])].map(String));
    const b = new Set((first.row.opponentIds || []).map(String));
    for (const item of match.rows) {
      if (!a.has(String(item.player.profileId))) {
        b.add(String(item.player.profileId));
        for (const teammate of item.row.teammateIds || []) b.add(String(teammate));
      }
    }
    // Contradictory metadata must not silently put a player on both teams.
    if ([...b].some((playerId) => a.has(playerId))) continue;
    const accepts = (friendly, enemy) =>
      evaluate(rules.friendly, friendly) && evaluate(rules.enemy, enemy);
    if (accepts(a, b) || accepts(b, a)) result.push(match);
  }
  return result.sort(
    (a, b) =>
      (b.rows[0].row.date || 0) - (a.rows[0].row.date || 0) ||
      String(b.id).localeCompare(String(a.id), undefined, { numeric: true }),
  );
}
