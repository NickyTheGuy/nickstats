export function tradeSelection(playerId, matchIds, side) {
  const ids = [...new Set(matchIds.map(Number))].sort((a,b) => a-b);
  return { playerId: String(playerId), match_ids: ids, side, key: JSON.stringify([String(playerId), side, ids]) };
}

export function createTradeTeammatesClient(fetcher, now = Date.now) {
  const cache = new Map();
  let generation = 0;
  return {
    invalidate() { generation++; cache.clear(); },
    async load(selection, signal) {
      const cached = cache.get(selection.key);
      if (cached && now() - cached.at < 60_000) return cached.value;
      const started = generation;
      const response = await fetcher(`/nickstats/api/players/${encodeURIComponent(selection.playerId)}/trade-teammates`, {
        method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, cache:'no-store',signal,
        body:JSON.stringify({match_ids:selection.match_ids,side:selection.side})
      });
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 404
        ? 'Teammate trade breakdowns are not available on this server yet.' : value?.reason || 'Could not load teammate trades.');
      if (!Array.isArray(value?.outgoing) || !Array.isArray(value?.incoming)) throw new Error('Invalid teammate trade response.');
      if (signal?.aborted) throw new DOMException('Request cancelled','AbortError');
      if (started === generation) {
        cache.delete(selection.key); cache.set(selection.key,{at:now(),value});
        while (cache.size > 8) cache.delete(cache.keys().next().value);
      }
      return value;
    }
  };
}

export function tradeRows(rows) {
  return rows.map(row => ({...row,
    response: row.opportunities > 0 ? 100 * row.attempts / row.opportunities : null,
    success: row.attempts > 0 ? 100 * row.trades / row.attempts : null
  }));
}
