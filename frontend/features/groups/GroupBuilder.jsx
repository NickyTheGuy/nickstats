import Button from '../../shared/components/buttons/Button.jsx';
import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';
import PlayerIdentity from '../../shared/components/players/PlayerIdentity.jsx';
import RuleGroup from './RuleGroup.jsx';
import { countNodes, MAX_RULE_NODES } from './state/rules.mjs';

export default function GroupBuilder({ players, rules, displayed, onRules, onDisplay, onRemove }) {
  const canAdd = countNodes(rules.friendly) + countNodes(rules.enemy) < MAX_RULE_NODES;
  return <div className="group-query-builder">
    <p>Choose players to search, then set the friendly and enemy team conditions. Each match can qualify in either direction and is counted once.</p>
    <div className="group-query-players">
      {players.map(player => <div className="group-selected-player" key={player.id}>
        <PlayerIdentity player={player} />
        <CheckboxGroup label={`Display statistics for ${player.name}`} options={[[String(player.id), 'Show stats']]}
          selected={displayed} onChange={onDisplay} />
        <Button className="group-player-remove" aria-label={`Remove ${player.name}`} onClick={() => onRemove(player.id)}>×</Button>
      </div>)}
    </div>
    <p className="group-rule-help">Show stats is independent of the conditions. A player who did not play a qualifying match contributes no row.</p>
    <div className="group-rule-teams">
      {['friendly', 'enemy'].map(side => <RuleGroup key={side} title={`${side === 'friendly' ? 'Friendly' : 'Enemy'} group`}
        node={rules[side]} players={players} canAdd={canAdd} onChange={node => onRules({ ...rules, [side]: node })} />)}
    </div>
    <p className="group-rule-help">Include means present on that team; Exclude means absent from that team. XOR means exactly one condition is true. Empty groups impose no restriction. Searches cover matches involving at least one selected player.</p>
  </div>;
}
