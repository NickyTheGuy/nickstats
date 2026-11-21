import { useEffect } from 'react';
import RuleGroup from './RuleGroup.jsx';
import useRuleGestures from './hooks/useRuleGestures.js';
import { findRule, moveConditions, updateRule, ungroupCondition } from './state/editing.mjs';

export default function GroupBuilder({ players, rules, onRules, onRemove }) {
  const byId = new Map(players.map((player) => [String(player.id), player]));
  function move(moving, target) {
    const changed = moveConditions(rules, moving.ids || [moving.id], target);
    if (changed !== rules) onRules(changed);
  }
  const gestures = useRuleGestures({ rules, onRules, onMove: move });
  const selected = gestures.selected.filter((id) => findRule(rules, id));
  useEffect(() => {
    if (selected.length !== gestures.selected.length) gestures.setSelected(selected);
  }, [rules]);
  const actions = {
    update: (id, patch) => onRules(updateRule(rules, id, patch)),
    remove: (id) => onRemove(findRule(rules, id).node.playerId),
    ungroup: (id) => {
      onRules(ungroupCondition(rules, id));
      gestures.setSelected([]);
    },
  };
  const ghost = gestures.gesture?.kind === 'move' ? gestures.gesture : null;
  const marquee = gestures.gesture?.kind === 'marquee' ? gestures.gesture.rect : null;
  return (
    <div className="group-query-builder">
      <div ref={gestures.board} className="group-rule-board" {...gestures.boardEvents}>
        <div className="group-rule-teams">
          {['friendly', 'enemy'].map((side) => (
            <RuleGroup
              key={side}
              title={side === 'friendly' ? 'Friendly' : 'Enemy'}
              root
              node={rules[side]}
              players={byId}
              gestures={gestures}
              actions={actions}
            />
          ))}
        </div>
        {marquee && (
          <div
            className="group-selection-rectangle"
            style={{
              left: marquee.left,
              top: marquee.top,
              width: Math.max(0, marquee.right - marquee.left),
              height: Math.max(0, marquee.bottom - marquee.top),
            }}
          />
        )}
        {ghost && (
          <div className="group-drag-preview" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>
            {ghost.moving.ids?.length > 1
              ? `${ghost.moving.ids.length} selected items`
              : byId.get(findRule(rules, ghost.moving.id)?.node.playerId)?.name ||
                'Condition group'}
          </div>
        )}
      </div>
      {gestures.notice && (
        <span className="group-rule-help" role="status">
          {gestures.notice}
        </span>
      )}
    </div>
  );
}
