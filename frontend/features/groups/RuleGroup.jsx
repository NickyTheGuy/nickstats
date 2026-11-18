import Button from '../../shared/components/buttons/Button.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import RuleCondition from './RuleCondition.jsx';
import { condition, group, MAX_RULE_DEPTH } from './state/rules.mjs';

const operators = [['and', 'All (AND)'], ['or', 'Any (OR)'], ['xor', 'Exactly one (XOR)'], ['none', 'None']];
export default function RuleGroup({ node, title = 'Condition group', players, depth = 0, canAdd, onChange, onRemove }) {
  const update = (index, value) => onChange({ ...node, children: node.children.map((child, i) => i === index ? value : child) });
  const remove = index => onChange({ ...node, children: node.children.filter((_, i) => i !== index) });
  const append = child => onChange({ ...node, children: [...node.children, child] });
  return <fieldset className="group-rule-group">
    <legend>{title}</legend>
    <div className="group-rule-heading">
      <OptionField label="Match conditions" options={operators} value={node.op}
        onChange={op => onChange({ ...node, op })} />
      {onRemove && <Button className="button button-secondary" onClick={onRemove}>Remove group</Button>}
    </div>
    {!node.children.length && <p className="group-rule-help">No restriction. Add a player condition or a nested group.</p>}
    {node.children.map((child, index) => child.playerId != null
      ? <RuleCondition key={child.id} node={child} players={players} onChange={value => update(index, value)} onRemove={() => remove(index)} />
      : <RuleGroup key={child.id} node={child} players={players} depth={depth + 1} canAdd={canAdd}
        onChange={value => update(index, value)} onRemove={() => remove(index)} />)}
    <div className="group-rule-actions">
      <Button className="button button-secondary" disabled={!players.length || !canAdd || depth >= MAX_RULE_DEPTH}
        onClick={() => append(condition(players[0].id))}>Add player condition</Button>
      <Button className="button button-secondary" disabled={!canAdd || depth >= MAX_RULE_DEPTH - 1}
        onClick={() => append(group())}>Add condition group</Button>
    </div>
  </fieldset>;
}
