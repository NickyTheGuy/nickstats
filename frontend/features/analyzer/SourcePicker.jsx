import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';
import GroupBuilder from '../groups/GroupBuilder.jsx';
import { normalizeEditorRules } from '../groups/state/editing.mjs';
import PlayerSearch from '../players/search/PlayerSearch.jsx';
import { createPlayerSearch } from '../players/state/player-search.mjs';
import {
  analyzerMatches,
  conditionPlayers,
  rulesForPlayers,
  parseAnalyzerRoute,
} from './state/query.mjs';
import { candidateMatches } from './state/server.mjs';
import mapData from './state/maps.json';
import { browserPreferences } from '../../shared/state/preferences.mjs';
import { preference } from './state/preferences.mjs';

export default function SourcePicker({
  saved,
  mode,
  onMode,
  entry,
  onChoose,
  onClear,
  matchFilters,
}) {
  const [players, setPlayers] = useState(saved.players),
    [rules, setRules] = useState(() =>
      normalizeEditorRules(
        saved.rules || rulesForPlayers(saved.players),
        saved.players.map((p) => p.id),
      ),
    );
  const [matchID, setMatchID] = useState(saved.matchID),
    [candidates, setCandidates] = useState(null),
    [map, setMap] = useState(saved.map);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [pendingTags, setPendingTags] = useState(saved.tags);
  const [search] = useState(() => createPlayerSearch());
  const { dates, tags, revision } = matchFilters;
  const operation = useRef(null),
    boot = useRef(false),
    skipEntry = useRef(saved.route === location.hash ? entry : null),
    pendingAccount = useRef(saved.account);
  const [hydrated, setHydrated] = useState(false),
    [hasSearched, setHasSearched] = useState(saved.loaded);
  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    browserPreferences().set(preference('source'), {
      mode,
      matchID,
      players,
      rules,
      map,
      date: { from: dates.from, through: dates.through },
      tags: pendingTags.length ? pendingTags : [...tags.selected],
      account: pendingTags.length
        ? pendingAccount.current
        : window.NickStatsManualFilters.store.account,
      loaded: hasSearched,
      route: location.hash.startsWith('#analyzer')
        ? location.hash
        : browserPreferences().read(preference('source'), saved).route,
    });
  }, [hydrated, mode, matchID, players, rules, map, pendingTags, hasSearched, revision]);
  useEffect(
    () => () => {
      operation.current?.abort();
      search.destroy();
    },
    [],
  );
  function invalidate() {
    setHasSearched(false);
    operation.current?.abort();
    setPending(false);
    setCandidates(null);
    setError('');
    onClear();
  }
  function editPlayers(next) {
    invalidate();
    setPlayers(next);
    setRules(
      normalizeEditorRules(
        rules,
        next.map((p) => String(p.id)),
      ),
    );
  }
  async function lookup(nextPlayers = players, nextMatchID = null, nextMap = map) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setHasSearched(true);
    setPending(true);
    setError('');
    setCandidates(null);
    onClear();
    try {
      const matches = await candidateMatches({
        players: nextPlayers,
        matchID: nextMatchID,
        map: nextMatchID ? undefined : nextMap,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (nextMatchID) {
        if (!matches.length) throw new Error('This match was not found.');
        onChoose({ mode: 'match', matches, players: [] });
      } else setCandidates(matches);
    } catch (e) {
      if (!controller.signal.aborted) {
        setHasSearched(false);
        setError(e.message);
      }
    } finally {
      if (operation.current === controller) {
        setPending(false);
        operation.current = null;
      }
    }
  }
  useEffect(() => {
    const store = window.NickStatsManualFilters.store;
    if (
      pendingTags.length &&
      pendingAccount.current &&
      store.account &&
      pendingAccount.current !== store.account
    ) {
      setPendingTags([]);
      return;
    }
    if (
      !pendingTags.length ||
      !store.account ||
      !store.ready ||
      pendingTags.some(([id]) => !store.filters.some((tag) => tag.id === id))
    )
      return;
    tags.reset();
    for (const [id, condition] of pendingTags) tags.select(id, condition);
    setPendingTags([]);
  }, [pendingTags, revision]);
  const matching = useMemo(
    () =>
      candidates === null || pendingTags.length
        ? []
        : analyzerMatches(candidates, rules, (m) => dates.matches(m.played_at) && tags.matches(m)),
    [candidates, rules, revision, pendingTags],
  );
  const maps = useMemo(
    () => [...new Set([...Object.keys(mapData.maps), ...(map ? [map] : [])])].sort(),
    [map],
  );
  const chosenMap = map;
  const scoped = useMemo(() => matching.filter((m) => m.map === chosenMap), [matching, chosenMap]);
  const used = useMemo(() => conditionPlayers(players, rules), [players, rules]);
  useEffect(() => {
    if (mode === 'groups' && chosenMap && candidates !== null)
      onChoose({ mode: 'groups', matches: scoped, players: used, map: chosenMap });
  }, [mode, candidates, scoped, used, chosenMap, onChoose]);
  useEffect(() => {
    if (!entry) return;
    if (skipEntry.current === entry) {
      skipEntry.current = null;
      return;
    }
    boot.current = true;
    pendingAccount.current = null;
    operation.current?.abort();
    search.reset();
    setError('');
    setCandidates(null);
    onMode(entry.mode);
    if (entry.mode === 'match') {
      setPendingTags([]);
      setMatchID(entry.matchID);
      lookup([], entry.matchID);
      return;
    }
    const nextRules = normalizeEditorRules(
      entry.rules,
      entry.players.map((p) => p.id),
    );
    setPlayers(entry.players);
    setRules(nextRules);
    setMap(entry.map || '');
    dates.from = entry.date?.from || '';
    dates.through = entry.date?.through || '';
    dates.closeMenus();
    tags.reset();
    setPendingTags(entry.tags || []);
    if (entry.map) lookup(entry.players, null, entry.map);
    else onClear();
  }, [entry]);
  useEffect(() => {
    const restore = () => {
      if (
        boot.current ||
        !location.hash.startsWith('#analyzer') ||
        (parseAnalyzerRoute(location.hash) && location.hash !== saved.route)
      )
        return;
      boot.current = true;
      if (saved.loaded) {
        if (saved.mode === 'match' && saved.matchID) lookup([], saved.matchID);
        else if (saved.mode === 'groups' && saved.map && saved.players.length)
          lookup(saved.players, null, saved.map);
      }
    };
    restore();
    window.addEventListener('nickstats:page', restore);
    return () => window.removeEventListener('nickstats:page', restore);
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (mode === 'groups' && candidates !== null) lookup();
      else if (mode === 'match' && matchID) lookup([], matchID);
    };
    window.addEventListener('nickstats:matches-changed', refresh);
    window.addEventListener('nickstats:replays-changed', refresh);
    return () => {
      window.removeEventListener('nickstats:matches-changed', refresh);
      window.removeEventListener('nickstats:replays-changed', refresh);
    };
  }, [mode, candidates, players, matchID]);
  const missing = scoped.filter((m) => !m.capture).length;
  return (
    <section className="panel analyzer-source" aria-label="Analyzer source">
      <ToggleGroup
        label="Analyzer mode"
        className="segmented-control"
        value={mode}
        options={[
          ['match', 'Match'],
          ['groups', 'Groups'],
        ]}
        onChange={(value) => {
          invalidate();
          onMode(value);
        }}
      />
      {mode === 'match' ? (
        <form
          className="analyzer-match-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d+$/.test(matchID) && Number(matchID) > 0) lookup([], matchID);
          }}
        >
          <label htmlFor="analyzerMatchID">Match</label>
          <input
            id="analyzerMatchID"
            aria-label="Stored match ID"
            type="text"
            inputMode="numeric"
            value={matchID}
            placeholder="Match ID"
            onChange={(e) => {
              setHasSearched(false);
              setMatchID(e.target.value);
            }}
          />
          <Button
            type="submit"
            className="button button-primary"
            disabled={pending || !/^\d+$/.test(matchID) || Number(matchID) <= 0}
          >
            Open match
          </Button>
        </form>
      ) : (
        <>
          <PlayerSearch
            store={search}
            prefix="analyzer"
            variant="group"
            onSelect={(player) => {
              if (players.length < 20 && !players.some((p) => String(p.id) === String(player.id))) {
                editPlayers([...players, { ...player, id: String(player.id) }]);
                search.reset();
              }
            }}
            excluded={(id) => players.some((p) => String(p.id) === id) || players.length >= 20}
          />
          <GroupBuilder
            players={players}
            rules={rules}
            onRules={(next) => {
              invalidate();
              setRules(next);
            }}
            onRemove={(id) => editPlayers(players.filter((p) => String(p.id) !== String(id)))}
          />
          <div className="analyzer-source-actions">
            <OptionField
              label="Map"
              options={[
                ['', 'Choose map'],
                ...maps.map((name) => [name, name.replace(/^de_/, '')]),
              ]}
              value={map}
              onChange={(value) => {
                invalidate();
                setMap(value);
              }}
            />
            <Button
              className="button button-primary"
              disabled={pending || !players.length || !map}
              onClick={() => lookup()}
            >
              Find matches
            </Button>
          </div>
          {candidates !== null && (
            <div className="analyzer-query-result">
              {!pendingTags.length && !scoped.length && (
                <FormMessage>No matching matches.</FormMessage>
              )}
              {missing > 0 && (
                <FormMessage>
                  {missing}{' '}
                  {missing === 1
                    ? 'match needs a movement capture.'
                    : 'matches need movement captures.'}
                </FormMessage>
              )}
            </div>
          )}
        </>
      )}
      {pending && (
        <div className="analyzer-query-progress">
          <FormMessage>Finding matches…</FormMessage>
          <Button
            className="button button-secondary"
            onClick={() => {
              operation.current?.abort();
              setPending(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      {mode === 'groups' && !!pendingTags.length && (
        <div className="analyzer-query-progress">
          <FormMessage>
            {!window.NickStatsManualFilters.store.account
              ? 'Log in to apply the saved tag filters.'
              : window.NickStatsManualFilters.store.ready
                ? 'Some saved tags are unavailable to this account.'
                : 'Loading saved tag filters…'}
          </FormMessage>
          <Button className="button button-secondary" onClick={() => setPendingTags([])}>
            Clear saved tags
          </Button>
        </div>
      )}
      <FormMessage error>{error}</FormMessage>
    </section>
  );
}
