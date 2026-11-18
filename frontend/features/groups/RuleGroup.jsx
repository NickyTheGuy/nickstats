import Button from '../../shared/components/buttons/Button.jsx';
import OptionDropdown from '../../shared/components/forms/OptionDropdown.jsx';
import RuleCondition from './RuleCondition.jsx';

const operators = [['and', 'AND'], ['or', 'OR'], ['xor', 'XOR'], ['none', 'NONE']];
export default function RuleGroup({ node, title, players, root = false, atom = false, gestures, actions }) {
  const selected = gestures.selected.includes(node.id);
  const highlighted = gestures.gesture?.target === node.id;
  return <section className={`group-rule-cluster${root ? ' is-team' : ''}${selected ? ' is-selected' : ''}${highlighted ? ' is-drop-target' : ''}`}
    role="group" aria-label={title || 'Condition group'} data-drop-group={node.id}
    data-team-root={root ? node.id : undefined} data-movable-id={root ? undefined : node.id}
    data-root-atom={atom ? node.id : undefined}>
    <div className="group-cluster-heading">
      {root ? <strong>{title}</strong> : <Button className="group-drag-handle" aria-label="Select or move condition group" aria-pressed={selected}
        onPointerDown={event => gestures.begin(event, { id: node.id })}
        onClick={event => { if (event.detail === 0) gestures.select(node.id, true); }}>⠿</Button>}
      <OptionDropdown className="group-rule-operator" label={`${title || 'Condition group'} operator`} options={operators} value={node.op}
        onChange={op => actions.update(node.id, { op })} />
      {!root && <Button className="group-player-remove" aria-label="Ungroup conditions" title="Ungroup; keep the player conditions"
        onClick={() => actions.ungroup(node.id)}>×</Button>}
    </div>
    <div className="group-cluster-cells">
      {!node.children.length && <span className="group-drop-help">Drop players here · no restriction</span>}
      {node.children.map(child => child.playerId != null
        ? <RuleCondition key={child.id} node={child} player={players.get(child.playerId) || {id:child.playerId,name:'Unknown player'}}
          atom={root} selected={gestures.selected.includes(child.id)} gestures={gestures}
          onChange={exclude => actions.update(child.id, { exclude })} onRemove={() => actions.unassign(child.id)} />
        : <RuleGroup key={child.id} node={child} players={players} atom={root} gestures={gestures} actions={actions} />)}
    </div>
  </section>;
}
