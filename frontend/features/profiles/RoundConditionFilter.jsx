import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import Button from '../../shared/components/buttons/Button.jsx';
import { roundConditions } from './state/round-conditions.mjs';

function conditionTooltip(key, label) {
  if (key === 'opening_attempt') return 'Rounds with an opening kill or opening death';
  if (key === 'no_opening') return 'Rounds with neither an opening kill nor an opening death';
  return label;
}

const conditionOptions = roundConditions.map(([key, label]) => [
  key,
  label,
  { title: conditionTooltip(key, label) },
]);

export default function RoundConditionFilter({
  value = 'ALL',
  loading = false,
  error = '',
  rounds = 0,
  playerCount = 1,
  loadedPlayers = 0,
  covered = 0,
  expected = 0,
  onChange,
  onRetry,
}) {
  const coverageNote =
    covered < expected
      ? ` · condition data available for ${covered.toLocaleString()} of ${expected.toLocaleString()} rounds`
      : '';
  const roundLabel =
    playerCount > 1
      ? 'matching player-rounds'
      : rounds === 1
        ? 'matching round'
        : 'matching rounds';
  const summary = `${rounds.toLocaleString()} ${roundLabel} · full-round stats${coverageNote}`;
  const loadingStatus =
    playerCount > 1
      ? `Loading round conditions… ${loadedPlayers} of ${playerCount} players`
      : 'Loading round conditions…';
  const status = error || (loading ? loadingStatus : summary);

  return (
    <>
      <ToggleGroup
        label="Player round conditions"
        value={value}
        options={conditionOptions}
        onChange={onChange}
        className="segmented-control"
      />
      {value !== 'ALL' && (
        <FormMessage error={Boolean(error)} className="filter-field__message">
          {status}
        </FormMessage>
      )}
      {value !== 'ALL' && error && (
        <Button className="button button-secondary" onClick={onRetry}>
          Retry conditions
        </Button>
      )}
    </>
  );
}
