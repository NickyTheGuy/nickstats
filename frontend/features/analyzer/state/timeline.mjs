// Use the small saved round summaries, even when movement isn't cached yet.
export function selectionTimeline(replays, keys) {
  const chosen = new Set(keys);
  let count = 0,
    duration = 0;
  for (const replay of replays)
    for (const round of replay.rounds)
      if (chosen.has(`${replay.match_uid}:${round.number}`)) {
        count++;
        duration = Math.max(duration, round.duration);
      }
  return { count, duration };
}
