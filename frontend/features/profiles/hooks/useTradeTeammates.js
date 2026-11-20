import { useEffect, useState } from 'react';
import { createTradeTeammatesClient } from '../state/trade-teammates.mjs';

const client = createTradeTeammatesClient((...args) => fetch(...args));

export default function useTradeTeammates(selection, active) {
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState({});
  useEffect(() => {
    const changed = () => { client.invalidate(); setRevision(value => value + 1); };
    window.addEventListener('nickstats:matches-changed', changed);
    return () => window.removeEventListener('nickstats:matches-changed', changed);
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setView({key:selection.key,revision,status:'loading'});
    const load = selection.match_ids.length ? client.load(selection,controller.signal)
      : Promise.resolve({outgoing:[],incoming:[]});
    load.then(data => {
      if (!controller.signal.aborted) setView({key:selection.key,revision,status:'ready',data});
    }).catch(error => {
      if (!controller.signal.aborted) setView({key:selection.key,revision,status:'error',error:error.message});
    });
    return () => controller.abort();
  }, [selection.key,active,revision]);
  const current = view.key === selection.key && view.revision === revision ? view : {status:'loading'};
  return { ...current, retry: () => { client.invalidate(); setRevision(value => value + 1); } };
}
