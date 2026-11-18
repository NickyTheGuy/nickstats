import { group, condition, countNodes, MAX_RULE_DEPTH, MAX_RULE_NODES, sanitizeRules } from './rules.mjs';

export function findRule(rules, id) {
  function walk(node, side, path = []) {
    if (node.id === id) return { node, side, path };
    for (const child of node.children || []) {
      const found = walk(child, side, [...path, node.id]);
      if (found) return found;
    }
    return null;
  }
  return walk(rules.friendly, 'friendly') || walk(rules.enemy, 'enemy');
}

function mapTree(node, edit) {
  const changed = edit(node);
  return changed.children ? { ...changed, children: changed.children.map(child => mapTree(child, edit)) } : changed;
}
export function updateRule(rules, id, patch) {
  return Object.fromEntries(['friendly', 'enemy'].map(side => [side, mapTree(rules[side], node => node.id === id ? { ...node, ...patch } : node)]));
}
function without(node, id) {
  return node.children ? { ...node, children: node.children.filter(child => child.id !== id).map(child => without(child, id)) } : node;
}
function compact(node, root = false) {
  if (!node.children) return node;
  const children = node.children.map(child => compact(child)).filter(Boolean);
  if (!root && !children.length) return null;
  // Keep explicitly created single-player outlines, including meaningful NONE
  // negation. Only empty clusters disappear when their last cell is moved out.
  return { ...node, children };
}
const compactRules = rules => ({ friendly: compact(rules.friendly, true), enemy: compact(rules.enemy, true) });
const depth = node => node.children?.length ? 1 + Math.max(...node.children.map(depth)) : 0;
function withinLimits(rules) {
  return countNodes(rules.friendly) + countNodes(rules.enemy) <= MAX_RULE_NODES
    && Math.max(depth(rules.friendly), depth(rules.enemy)) <= MAX_RULE_DEPTH;
}

export function removeCondition(rules, id) {
  const found = findRule(rules, id);
  if (!found?.path.length) return rules;
  return compactRules({ ...rules, [found.side]: without(rules[found.side], id) });
}

export function moveCondition(rules, id, targetId) {
  const found = findRule(rules, id);
  if (!found?.path.length) return rules;
  const target = findRule(rules, targetId);
  if (!target?.node.children || targetId === id || target.path.includes(id)) return rules;
  if (found?.path.at(-1) === targetId) return rules;
  const moving = found.node;
  let result = { ...rules, [found.side]: without(rules[found.side], id) };
  result = updateRule(result, targetId, { children: [...findRule(result, targetId).node.children, moving] });
  result = compactRules(result);
  return withinLimits(result) ? result : rules;
}

// A marquee selects whole root-level atoms. A cell already inside a condition
// group represents that group, so selecting it again cannot add a wrapper.
export function atomicSelection(rules, ids) {
  let side = null;
  const atoms = new Set();
  for (const id of ids) {
    const found = findRule(rules, id);
    if (!found?.path.length || (side && side !== found.side)) return null;
    side = found.side;
    atoms.add(found.path.length > 1 ? found.path[1] : id);
  }
  return side ? { side, ids: [...atoms] } : null;
}
export function groupSelection(rules, ids) {
  const selected = atomicSelection(rules, ids);
  if (!selected || !selected.ids.length) return null;
  const root = rules[selected.side], wanted = new Set(selected.ids);
  // A free player may get one outline, but an already grouped atom cannot be
  // wrapped again by selecting it (or any subset of its inner cells).
  if (selected.ids.length === 1 && root.children.find(child => child.id === selected.ids[0])?.children) return null;
  const children = root.children.filter(child => wanted.has(child.id));
  const cluster = group('and', children);
  let inserted = false;
  const next = root.children.flatMap(child => {
    if (!wanted.has(child.id)) return [child];
    if (inserted) return [];
    inserted = true;
    return [cluster];
  });
  const result = { ...rules, [selected.side]: { ...root, children: next } };
  return withinLimits(result) ? { rules: result, groupId: cluster.id } : null;
}
export function ungroupCondition(rules, id) {
  const found = findRule(rules, id);
  if (!found?.path.length || !found.node.children) return rules;
  const parent = findRule(rules, found.path.at(-1)).node;
  return updateRule(rules, parent.id, { children: parent.children.flatMap(child => child.id === id ? found.node.children : [child]) });
}
export function usedPlayers(rules) {
  const result = new Set();
  function walk(node) { if (node.playerId != null) result.add(node.playerId); else node.children.forEach(walk); }
  walk(rules.friendly); walk(rules.enemy);
  return result;
}
export function dropTargets(rules) {
  const targets = [];
  function walk(node, label) {
    if (!node.children) return;
    targets.push([node.id, label]);
    node.children.filter(child => child.children).forEach((child, index) => walk(child, `${label} · ${child.op === 'none' ? 'Exclude' : child.op.toUpperCase()} ${index + 1}`));
  }
  walk(rules.friendly, 'Friendly'); walk(rules.enemy, 'Enemy');
  return targets;
}


// Older saves used a hidden per-player negation. Make each one an explicit
// Exclude outline so removing the switches never silently changes its meaning.
export function normalizeEditorRules(value, playerIds) {
  const ids = [...playerIds].map(String);
  const clean = sanitizeRules(value, ids);
  function migrate(node, root = false) {
    if (node.playerId != null) return node.exclude
      ? group('none', [{ ...node, exclude: false }]) : node;
    const children = node.children.map(child => migrate(child)).filter(Boolean);
    return !root && !children.length ? null : { ...node, children };
  }
  const result = { friendly: migrate(clean.friendly, true), enemy: migrate(clean.enemy, true) };
  const assigned = usedPlayers(result);
  result.friendly.children.push(...ids.filter(id => !assigned.has(id)).map(id => condition(id)));
  return result;
}
