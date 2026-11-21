import { useEffect, useState } from 'react';
import { loadSelectionMatches } from '../state/selection-matches.mjs';
export default function useSelectionMatches(context, enabled = true) {
  const [state, setState] = useState({ context: null, players: null, error: '', loading: false }),
    [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((value) => value + 1);
  useEffect(() => {
    window.addEventListener('nickstats:matches-changed', retry);
    return () => window.removeEventListener('nickstats:matches-changed', retry);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ context, players: null, error: '', loading: true });
    loadSelectionMatches(context, {
      signal: controller.signal,
      expand: window.NickStatsPlayerStats.expandDenseProfile,
    })
      .then((players) => {
        if (!controller.signal.aborted) setState({ context, players, error: '', loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ context, players: null, error: error.message, loading: false });
      });
    return () => controller.abort();
  }, [context, enabled, attempt]);
  return {
    ...(state.context === context ? state : { players: null, error: '', loading: enabled }),
    retry,
  };
}
