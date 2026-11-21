import { eventSelectionKey } from './selection-scope.mjs';
import { onLevel, positionAt, worldToRadar } from './replay.mjs';
import { combatMarkers } from './combat.mjs';
import { utilityVisible, projectilePosition } from './utility.mjs';
import { roundChannels, createDisplay } from './display.mjs';
import { heldItem, blindRemaining, playerAlive } from './player-state.mjs';
import { selectionRoundKey } from './selection-targets.mjs';

import { inEventWindow, utilityWindowVisible } from './time-window.mjs';
import { utilitySelectionData } from './utility-selection.mjs';
export { utilityKeys } from './utility-selection.mjs';
export function entrySelected(item, selection) {
  const row =
    selection instanceof Map
      ? selection.get(actorKey(item))
      : selection.find((e) => actorKey(e) === actorKey(item));
  return Boolean(
    row &&
      (!item.cell || row.cell) &&
      (!item.events?.length || item.events.every((key) => row.events?.includes(key))) &&
      (!item.utilities.length || item.utilities.every((key) => row.utilities.includes(key))),
  );
}
export const actorKey = (entry) => JSON.stringify([entry.roundKey, entry.player]);
// Snapshot identities, rather than a live geographic query: scrubbing, zooming,
// adding another box, or crossing floors must not change an existing cohort.
export function mergeSelection(previous, incoming, append = false) {
  const actors = new Map();
  for (const item of [...(append ? previous : []), ...incoming]) {
    const key = actorKey(item),
      old = actors.get(key);
    actors.set(key, {
      ...item,
      ...(old?.cell || item.cell ? { cell: true } : {}),
      ...(old?.events || item.events
        ? { events: [...new Set([...(old?.events || []), ...(item.events || [])])] }
        : {}),
      utilities: [...new Set([...(old?.utilities || []), ...(item.utilities || [])])],
    });
  }
  return [...actors.values()];
}
// Remove marker identities, not their entire owning player-round.
export function subtractSelection(previous, incoming) {
  const removed = new Map(mergeSelection([], incoming).map((item) => [actorKey(item), item]));
  return previous.flatMap((item) => {
    const row = removed.get(actorKey(item));
    if (!row) return [item];
    if (!row.cell && !row.events?.length && !row.utilities.length) return [];
    const events = (item.events || []).filter((key) => !row.events?.includes(key)),
      utilities = item.utilities.filter((key) => !row.utilities.includes(key));
    const cell = Boolean(item.cell && !row.cell);
    if (!cell && !events.length && !utilities.length) return [];
    const next = { ...item, utilities };
    if (item.events) next.events = events;
    if (item.cell) next.cell = cell;
    return [next];
  });
}
export function toggleSelection(previous, incoming, append = false) {
  const rows = mergeSelection([], incoming),
    selected = new Map(previous.map((item) => [actorKey(item), item]));
  return rows.length && rows.every((item) => entrySelected(item, selected))
    ? subtractSelection(previous, rows)
    : mergeSelection(previous, rows, append);
}
export function invertSelection(previous, visible) {
  const rows = mergeSelection([], visible),
    add = [],
    selected = new Map(previous.map((item) => [actorKey(item), item]));
  // Work atom by atom: an actor can own a cell, several kills and grenades.
  for (const item of rows) {
    const old = selected.get(actorKey(item));
    const next = {
      ...item,
      utilities: item.utilities.filter((key) => !old?.utilities.includes(key)),
    };
    if (item.events) next.events = item.events.filter((key) => !old?.events?.includes(key));
    if (item.cell) next.cell = !old?.cell;
    if (next.cell || next.events?.length || next.utilities.length) add.push(next);
  }
  return mergeSelection(subtractSelection(previous, rows), add, true);
}
export function visibleMapCandidates(candidates, size, view) {
  const scale = Math.min(size.width, size.height) / 1024;
  if (!scale) return [];
  return candidates.flatMap((item) => {
    const screenX = size.width / 2 + ((item.x - 512) * view.zoom + view.x) * scale,
      screenY = size.height / 2 + ((item.y - 512) * view.zoom + view.y) * scale;
    return screenX < 0 || screenY < 0 || screenX > size.width || screenY > size.height
      ? []
      : [{ ...item, screenX, screenY }];
  });
}
export function invertSelectionShortcut(event) {
  if (
    event.key.toLowerCase() !== 'i' ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return false;
  const element = event.target;
  return !element?.closest?.(
    'textarea,select,[contenteditable]:not([contenteditable="false"]),input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"])',
  );
}
export function selectionCandidates(
  rounds,
  {
    map,
    level,
    time,
    startTime = 0,
    players,
    side = 0,
    utilities,
    layers,
    allSelected = false,
    unit = 1,
    showPlayers = true,
    permanentUtility = true,
    rosters = null,
    display = null,
    enemyDisplay = createDisplay(),
  },
) {
  const items = [];
  for (const round of rounds) {
    const roundKey = selectionRoundKey(round);
    if (!roundKey) continue;
    const initialDisplay = display || {
      ...createDisplay(),
      players: showPlayers,
      utilities,
      combat: layers,
      utilityLayers: permanentUtility ? ['Live', 'History'] : ['Live'],
    };
    for (const channel of roundChannels(round, {
      rosters,
      players,
      side,
      display: initialDisplay,
      enemyDisplay,
    })) {
      const selected = channel.ids,
        cells = channel.ids,
        side = channel.side,
        { display: settings } = channel;
      const showPlayers = settings.players,
        layers = settings.combat,
        utilities = settings.utilities,
        history = settings.utilityLayers.includes('History'),
        live = settings.utilityLayers.includes('Live');
      const add = (kind, player, actorSide, x, y, details = {}) =>
        items.push({
          kind,
          x,
          y,
          round,
          ...details,
          entry: {
            roundKey,
            player,
            side: actorSide,
            ...(kind === 'player' ? { cell: true } : {}),
            ...(details.event ? { events: [eventSelectionKey(kind, details.event)] } : {}),
            utilities: details.utilityKey == null ? [] : [details.utilityKey],
          },
        });
      if (showPlayers && time <= round.duration)
        for (const track of round.tracks) {
          if (!cells.has(track.player) || !playerAlive(round, track.player, time)) continue;
          const s = positionAt(track.samples, time);
          if (!s || !onLevel(level, s[3]) || (selected.has(track.player) && side && s[5] !== side))
            continue;
          add('player', track.player, s[5], ...worldToRadar(map, s[1], s[2]), {
            enemy: channel.enemy,
            item: settings.items ? heldItem(round, track.player, time) : null,
            blind: settings.blindness ? blindRemaining(round, track.player, time) : 0,
          });
        }
      for (const event of round.deaths || []) {
        if (!inEventWindow(event.time, startTime, time)) continue;
        for (const mark of combatMarkers(event, {
          selected,
          side,
          layers,
          map,
          level,
          unit,
          singleRound: rounds.length === 1,
          cellDeaths: rounds.length === 1 && showPlayers,
        }))
          add(
            mark.kind,
            mark.actor,
            mark.kind === 'kill' ? event.killer_side : event.victim_side,
            mark.x,
            mark.y,
            { event },
          );
      }
      const { keys, projectiles } = utilitySelectionData(round);
      if (live)
        for (const { projectile, effect, key } of projectiles) {
          if (
            !utilities.includes(projectile.type) ||
            (!projectile.player && !allSelected) ||
            !utilityVisible(projectile, round, selected, side)
          )
            continue;
          const point = projectilePosition(projectile, time);
          if (!point || !onLevel(level, point[3])) continue;
          add(
            'utility',
            projectile.player,
            projectile.side,
            ...worldToRadar(map, point[1], point[2]),
            { effect, projectile, utilityKey: key, enemy: channel.enemy },
          );
        }
      for (const [utilityIndex, effect] of round.utility.entries()) {
        if (
          !utilityWindowVisible(effect, {
            time,
            startTime,
            history,
            live,
            duration: round.duration,
          }) ||
          !utilities.includes(effect.type) ||
          (!effect.player && !allSelected) ||
          !utilityVisible(effect, round, selected, side) ||
          !onLevel(level, effect.z)
        )
          continue;
        add('utility', effect.player, effect.side, ...worldToRadar(map, effect.x, effect.y), {
          effect,
          utilityKey: keys[utilityIndex],
          enemy: channel.enemy,
        });
      }
    }
  }
  return items;
}
export function candidatesInArea(candidates, area) {
  return candidates
    .filter((p) => p.x >= area.left && p.x <= area.right && p.y >= area.top && p.y <= area.bottom)
    .map((p) => p.entry);
}
