import { useEffect, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';
import OptionDropdown from '../../shared/components/forms/OptionDropdown.jsx';
import RuleGroup from './RuleGroup.jsx';
import RuleCondition from './RuleCondition.jsx';
import useRuleGestures from './hooks/useRuleGestures.js';
import { findRule, usedPlayers, moveCondition, updateRule, ungroupCondition, groupSelection, dropTargets } from './state/editing.mjs';

export default function GroupBuilder({ players, rules, displayed, onRules, onDisplay, onRemove }) {
  const [benchChoices, setBenchChoices] = useState({});
  const used = usedPlayers(rules), byId = new Map(players.map(player => [String(player.id), player]));
  const available = players.filter(player => !used.has(String(player.id)));
  function movingFor(id) {
    const player = available.find(player => `bench:${player.id}` === id);
    return { id, playerId: player ? String(player.id) : null };
  }
  function rememberBenchChoices(nodes) {
    const choices = {};
    function visit(node) {
      if (!node) return;
      if (node.playerId != null) choices[node.playerId] = node.exclude;
      else node.children.forEach(visit);
    }
    nodes.forEach(visit);
    setBenchChoices(previous => ({ ...previous, ...choices }));
  }
  function move(moving, target) {
    const source = findRule(rules, moving.id)?.node;
    if (target === 'bench') rememberBenchChoices([source]);
    const changed = moveCondition(rules, moving.playerId ? null : moving.id, target, moving.playerId,
      Boolean(benchChoices[moving.playerId]));
    if (changed !== rules) { onRules(changed); gestures.setNotice('Moved player conditions.'); }
    else gestures.setNotice('That move would not change the rules, or would nest a group inside itself.');
  }
  const gestures = useRuleGestures({ rules, onRules, onMove: move });
  const selected = gestures.selected.filter(id => findRule(rules, id) || available.some(player => `bench:${player.id}` === id));
  useEffect(() => {
    if (selected.length !== gestures.selected.length) gestures.setSelected(selected);
  }, [rules, players]);
  const grouped = selected.length ? groupSelection(rules, selected) : null;
  function groupSelected() {
    if (!grouped) return;
    onRules(grouped.rules); gestures.setSelected([grouped.groupId]); gestures.setNotice('Created condition group.');
  }
  function moveSelected(target) {
    let changed = rules;
    const top = selected.filter(id => !findRule(rules, id)?.path.some(parent => selected.includes(parent)));
    for (const id of top) {
      const moving = movingFor(id);
      changed = moveCondition(changed, moving.playerId ? null : id, target, moving.playerId, Boolean(benchChoices[moving.playerId]));
    }
    if (changed !== rules) {
      if (target === 'bench') rememberBenchChoices(top.map(id => findRule(rules, id)?.node));
      onRules(changed); gestures.setSelected([]); gestures.setNotice('Moved selected conditions.');
    }
  }
  const actions = {
    update: (id, patch) => onRules(updateRule(rules, id, patch)),
    unassign: id => move({ id }, 'bench'),
    ungroup: id => { onRules(ungroupCondition(rules, id)); gestures.setSelected([]); }
  };
  const ghost = gestures.gesture?.kind === 'move' ? gestures.gesture : null;
  const marquee = gestures.gesture?.kind === 'marquee' ? gestures.gesture.rect : null;
  return <div className="group-query-builder">
    <div className="group-stats-choice" data-no-gesture>
      <strong>Show stats</strong>
      <CheckboxGroup label="Players whose statistics are displayed" className="group-stats-players"
        options={players.map(player => [String(player.id), player.name])} selected={displayed} onChange={onDisplay} />
    </div>
    <p className="group-rule-help">Drag player cells between teams. Drag across blank team space to group cells; existing groups stay together. On touch or with a keyboard, select handles, then use Group selected or Move to.</p>
    <div ref={gestures.board} className="group-rule-board" {...gestures.boardEvents}>
      <div className={`group-player-bench${gestures.gesture?.target === 'bench' ? ' is-drop-target' : ''}`} role="group" aria-label="Available players" data-drop-group="bench">
        <strong>Available players</strong>
        <div className="group-cluster-cells">
          {available.map(player => <RuleCondition key={player.id} bench player={player}
            node={{ id: `bench:${player.id}`, exclude: Boolean(benchChoices[player.id]) }}
            selected={selected.includes(`bench:${player.id}`)} gestures={gestures}
            onChange={exclude => setBenchChoices(previous => ({ ...previous, [player.id]: exclude }))} onRemove={() => onRemove(player.id)} />)}
          {!available.length && <span className="group-drop-help">Drop here to remove a team condition. × on a cell returns it here.</span>}
        </div>
      </div>
      <div className="group-rule-teams">
        {['friendly', 'enemy'].map(side => <RuleGroup key={side} title={side === 'friendly' ? 'Friendly' : 'Enemy'} root
          node={rules[side]} players={byId} gestures={gestures} actions={actions} />)}
      </div>
      {marquee && <div className="group-selection-rectangle" style={{ left: marquee.left, top: marquee.top,
        width: Math.max(0, marquee.right - marquee.left), height: Math.max(0, marquee.bottom - marquee.top) }} />}
      {ghost && <div className="group-drag-preview" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>
        {ghost.moving.playerId ? byId.get(ghost.moving.playerId)?.name : byId.get(findRule(rules, ghost.moving.id)?.node.playerId)?.name || 'Condition group'}
      </div>}
    </div>
    {selected.length > 0 && <div className="group-selection-tools" data-no-gesture>
      <span>{selected.length} selected</span>
      <Button className="button button-secondary" disabled={!grouped} onClick={groupSelected}>Group selected</Button>
      <OptionDropdown label="Move selected conditions" options={[['', 'Move to…', { disabled: true }], ...dropTargets(rules)]} value="" onChange={moveSelected} className="group-move-selector" />
      <Button className="button button-secondary" onClick={() => gestures.setSelected([])}>Clear selection</Button>
    </div>}
    <span className="group-rule-help" role="status">{gestures.notice}</span>
    <p className="group-rule-help">AND: all · OR: any · XOR: exactly one · NONE: none. Include/Exclude applies only to that team. Show stats stays independent.</p>
  </div>;
}
