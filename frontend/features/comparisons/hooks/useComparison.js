import { useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import { comparisonReducer, initialComparisonState, withSections } from '../state/comparison.mjs';
import { createSectionPreferences } from '../state/sections.mjs';

let preferences;
function sectionPreferences(config) {
  if (!preferences) {
    let storage;
    try { storage = window.localStorage; } catch {}
    preferences = createSectionPreferences(config.sections.map(([key]) => key), storage);
  }
  return preferences;
}

export default function useComparison(input, resetKey) {
  const config = window.NickStatsScoreboard;
  const shared = sectionPreferences(config);
  const sections = useSyncExternalStore(shared.subscribe, shared.getSnapshot);
  const [state, dispatch] = useReducer((current, action) => comparisonReducer(current, action, config), config, initialComparisonState);
  const previousReset = useRef(resetKey);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    dispatch({ type: 'reset' });
  }, [resetKey]);
  useEffect(() => { dispatch({ type: 'sections', value: sections }); }, [sections]);
  const model = useMemo(() => window.NickStatsQuickComparison.model(input, {
    ...withSections(state, sections, config), visibleSections: new Set(sections)
  }), [input, state, sections, config]);
  useEffect(() => {
    if (model && model.map !== state.map) dispatch({ type: 'map', value: model.map });
  }, [model, state.map]);
  const actions = useMemo(() => ({
    sections: shared.set,
    map: value => dispatch({ type: 'map', value }),
    valueMode: value => dispatch({ type: 'valueMode', value }),
    utilityBasis: () => dispatch({ type: 'utilityBasis' }),
    toggle: group => dispatch({ type: 'toggle', group }),
    cycle: group => dispatch({ type: 'cycle', group }),
    sort: column => dispatch({ type: 'sort', column })
  }), [shared]);
  return useMemo(() => model && { ...model, actions }, [model, actions]);
}
