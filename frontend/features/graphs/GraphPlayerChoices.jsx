import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';

export default function GraphPlayerChoices({ players, selected, max = 5, onChange, descriptionId }) {
  return <CheckboxGroup label="Players to graph" descriptionId={descriptionId} className="react-player-choices" labelClassName="graph-player-choice"
    options={players.map(player => [player.id, player.name, { disabled: !selected.includes(player.id) && selected.length >= max }])}
    selected={selected} onChange={onChange} />;
}
