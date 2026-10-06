(() => {
  "use strict";
  const GAP_SECONDS = 2 * 60 * 60;
  const timestamp = match => {
    const value = Number(match.played_at);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  function group(matches) {
    const dated = matches.filter(match => timestamp(match) != null).slice()
      .sort((a, b) => timestamp(a) - timestamp(b) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    const sessions = [];
    for (const match of dated) {
      const start = timestamp(match), previous = sessions.at(-1);
      // Dates are start times. Calendar days and pagination never set boundaries.
      if (!previous || start - previous.lastStart >= GAP_SECONDS) {
        sessions.push({ id: String(match.id), start, lastStart: start, matches: [match] });
      } else { previous.lastStart = start; previous.matches.push(match); }
    }
    sessions.reverse().forEach(session => session.matches.reverse());
    // Undated matches cannot reliably be linked to each other or a dated session.
    matches.filter(match => timestamp(match) == null).slice()
      .sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }))
      .forEach(match => sessions.push({ id: String(match.id), start: null, lastStart: null, matches: [match] }));
    return sessions;
  }

  function filter(sessions, predicate) {
    return sessions.map(session => ({ ...session, matches: session.matches.filter(predicate) }))
      .filter(session => session.matches.length);
  }
  window.NickStatsMatchSessions = Object.freeze({ group, filter, GAP_SECONDS });
})();
