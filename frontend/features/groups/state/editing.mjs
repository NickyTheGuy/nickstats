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

// Drop descendant selections when their ancestor is selected, and keep tree order.
export function selectionRoots(rules, ids) {
  const wanted = new Set(ids);
  if ([...wanted].some(id => !findRule(rules, id)?.path.length)) return null;
  const result = [];
  function visit(node) {
    for (const child of node.children || []) {
      if (wanted.has(child.id)) result.push(child.id);
      else visit(child);
    }
  }
  visit(rules.friendly); visit(rules.enemy);
  return result;
}

export function moveConditions(rules, ids, targetId) {
  const roots = selectionRoots(rules, ids);
  const target = findRule(rules, targetId);
  if (!roots?.length || !target?.node.children) return rules;
  // Validate the whole drop before changing anything: never partially move a
  // selection when one item would contain itself or exceed the tree limits.
  if (roots.some(id => id === targetId || target.path.includes(id))) return rules;
  const moving = roots.map(id => findRule(rules, id))
    .filter(found => found.path.at(-1) !== targetId);
  if (!moving.length) return rules;
  let result = rules;
  for (const found of moving) {
    result = { ...result, [found.side]: without(result[found.side], found.node.id) };
  }
  result = updateRule(result, targetId, {
    children: [...findRule(result, targetId).node.children, ...moving.map(found => found.node)]
  });
  result = compactRules(result);
  return withinLimits(result) ? result : rules;
}

export function moveCondition(rules, id, targetId) {
  return moveConditions(rules, [id], targetId);
}

// Group direct siblings at any depth. Never promote a partial selection to an
// ancestor group: that would silently group players the user did not select.
export function atomicSelection(rules, ids) {
  const roots = selectionRoots(rules, ids);
  if (!roots?.length) return null;
  const found = roots.map(id => findRule(rules, id));
  const first = found[0], parentId = first.path.at(-1);
  if (found.some(item => item.side !== first.side || item.path.at(-1) !== parentId)) return null;
  return { side: first.side, parentId, ids: roots };
}
export function groupSelection(rules, ids) {
  const selected = atomicSelection(rules, ids);
  if (!selected) return null;
  const parent = findRule(rules, selected.parentId).node;
  const wanted = new Set(selected.ids);
  if (selected.ids.length === 1 && parent.children.find(child => wanted.has(child.id))?.children) return null;
  // All children of an existing outline already have their own group. A proper
  // subset may form a new subgroup, including a single ungrouped player.
  const isTeam = selected.parentId === rules[selected.side].id;
  if (!isTeam && selected.ids.length === parent.children.length) return null;
  const cluster = group('and', parent.children.filter(child => wanted.has(child.id)));
  let inserted = false;
  const children = parent.children.flatMap(child => {
    if (!wanted.has(child.id)) return [child];
    if (inserted) return [];
    inserted = true;
    return [cluster];
  });
  const result = updateRule(rules, parent.id, { children });
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
