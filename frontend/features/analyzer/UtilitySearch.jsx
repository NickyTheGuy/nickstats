import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import IconButton from '../../shared/components/buttons/IconButton.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import OverlayMenu from './OverlayMenu.jsx';
import RoundFilter from './RoundFilter.jsx';
import useRememberedState from '../../shared/hooks/useRememberedState.js';
import { preference, utilityPreferences } from './state/preferences.mjs';
import { analyzerJSON } from './state/server.mjs';
import {
  UTILITY_SEARCH_TYPES,
  utilityMetrics,
  utilityQuery,
  searchUtility,
} from './state/utility-search.mjs';

const icons = { HE: ['hegrenade'], Flash: ['flashbang'], Fire: ['molotov', 'incgrenade'] };
export default function UtilitySearch({
  scopes,
  players,
  side,
  open,
  onToggle,
  result,
  onResults,
}) {
  const [form, setForm] = useRememberedState(
      preference('utility'),
      () => ({ type: 'HE', metric: 'damage', minimum: '40' }),
      utilityPreferences,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState(null);
  const operation = useRef(null),
    scopeKey = JSON.stringify([scopes, players, side]);
  useEffect(() => {
    operation.current?.abort();
    setError('');
    setBusy(false);
    return () => operation.current?.abort();
  }, [scopeKey]);
  function edit(next) {
    operation.current?.abort();
    setForm(next);
    setError('');
    setBusy(false);
  }
  async function run(event) {
    event.preventDefault();
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError('');
    setProgress(null);
    try {
      const query = utilityQuery(scopes, players, { ...form, side });
      const found = await searchUtility(
        query,
        (next, { signal }) =>
          analyzerJSON('/utility/search', { method: 'POST', body: JSON.stringify(next), signal }),
        {
          signal: controller.signal,
          onProgress: (value) => {
            if (operation.current === controller && !controller.signal.aborted) setProgress(value);
          },
        },
      );
      controller.signal.throwIfAborted();
      onResults(found);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (operation.current === controller) setBusy(false);
    }
  }
  return (
    <OverlayMenu
      buttonLabel={`Utility${result ? ` · ${result.total}` : ''}`}
      label="Utility search"
      open={open}
      onToggle={onToggle}
    >
      <form className="analyzer-utility-form" onSubmit={run}>
        <RoundFilter
          label="Grenade"
          value={form.type}
          options={UTILITY_SEARCH_TYPES.map(([type, label]) => [
            type,
            <>
              {icons[type].map((icon) => (
                <img key={icon} src={`assets/grenades/${icon}.svg`} alt="" />
              ))}
              <span>{type === 'Flash' ? 'Flash' : type}</span>
            </>,
            { 'aria-label': label, title: label },
          ])}
          onChange={(type) =>
            edit({
              type,
              metric: type === 'Flash' ? 'enemies' : 'damage',
              minimum: type === 'Flash' ? '1' : '40',
            })
          }
        />
        <RoundFilter
          label="Effectiveness"
          value={form.metric}
          options={utilityMetrics(form.type).map(([key, label]) => [
            key,
            key === 'damage' ? 'Damage' : key === 'enemies' ? 'Enemies blinded' : 'Blind seconds',
            { title: label },
          ])}
          onChange={(metric) => edit({ ...form, metric, minimum: '1' })}
        />
        <div className="analyzer-utility-submit">
          <label className="analyzer-round-filter">
            Minimum
            <input
              aria-label="Minimum effectiveness"
              type="number"
              min="0"
              step={form.metric === 'blind_ms' ? '0.1' : '1'}
              value={form.minimum}
              onChange={(e) => edit({ ...form, minimum: e.target.value })}
            />
          </label>
          <Button
            type="submit"
            className="button button-primary"
            disabled={busy || !scopes.length || !players.length}
          >
            {busy
              ? progress
                ? `${progress.phase === 'indexing' ? 'Indexing' : 'Loading'} · ${progress.complete}/${progress.total}…`
                : 'Searching…'
              : 'Search'}
          </Button>
          {busy && (
            <IconButton
              label="Cancel utility search"
              className="button button-secondary"
              controlSize={34}
              onClick={() => {
                operation.current?.abort();
                setBusy(false);
              }}
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </IconButton>
          )}
        </div>
        <FormMessage error>{error}</FormMessage>
        {result && (
          <div className="analyzer-utility-summary">
            <output aria-live="polite">
              {result.total} {result.total === 1 ? 'grenade' : 'grenades'}
            </output>
            <IconButton
              label="Clear utility results"
              className="selection-chip"
              controlSize={28}
              onClick={() => onResults(null)}
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </IconButton>
          </div>
        )}
      </form>
    </OverlayMenu>
  );
}
