# Round conditions — 2026.11.21.3

Round conditions are available on individual player profiles, Player Quick
Comparison, group profiles and Group Quick Comparison. All keeps the ordinary
statistics. Opening kill and Opening death select those player rounds; Attempted
combines the two disjoint cohorts. No attempt selects known rounds with neither.
An opening attempt means an opening kill/death, not every shot before first blood.

Group team rules, map, date, tags and match-result filters determine the eligible
matches first. Opening conditions then select each displayed player's own rounds
within those matches. Comparisons do not require every player to meet the opening
condition in the same round. Their Rounds column shows the sample per player;
the filter's combined player-round count follows the comparison's selected map.

Cards and scoreboards summarize full-round performance, including the opening
and later combat. Rating, ADR, K/D and KAST use pooled selected player rounds.
Filtered win rate is round win rate. Only matches with a positive filtered round
sample contribute to comparison match counts and per-match denominators. Hero,
side, own/enemy buy, round result and regulation/overtime filters intersect once.
Match score previews stay explicitly whole-match scores.

## Loading and reuse

Normal All views make no round-condition requests. Selecting a condition reads
GET /players/:id/round-conditions using existing saved player_round_phase_stats.
The response contains disjoint opening cohorts with sparse full-round counters,
weapon totals and their round numbers; it does not load full demos or movement.

One shared frontend client serves all four views. It deduplicates in-flight reads
and limits cold requests to two at a time. A group profile reads only the selected
player with eligible matches; comparisons read their required players. Switching
conditions, ordinary filters, map tabs or group rosters reuses the responses.
The default cache retains up to 32 recent entries (plus any additional entries
required by the active comparison); ready entries expire on access after five
minutes. Match changes and profile refreshes invalidate the affected cached data.
Failed reads do not loop automatically; Retry requests only the failed players.
Returning to All or resetting filters cancels queued cold reads; already-running
reads can finish for reuse. Outdated in-flight responses cannot populate the cache
after invalidation.

The view hides its statistics while required responses load or fail. Group
histories marked stale must be rebuilt before new condition data can be applied.
Group building still requires an explicit action; condition loading never starts
an automatic group rebuild. Hidden group comparisons are not prepared eagerly.

## Coverage and limits

Unknown, missing or invalid legacy player-round payloads are excluded from every
opening cohort, including No attempt. Coverage is reported against saved player
round counts. History/condition round-count mismatches fail closed instead of
combining data from different revisions. Negative clutch economy deltas remain
valid payload data, even though clutch economics is hidden from the interface.

Supported statistics use saved full-round combat, opening, trades, utility,
movement, clutch, initiation, weapon and objective counters. Event timing/phase,
alive-count round-state, team-equipment-value breakdowns and teammate rating are
unavailable for round conditions. These views never reuse whole-match values for
unsupported statistics. Empty samples show no rating. Teammate trade tables on
individual profiles also follow the condition through their existing endpoint.

Graphs, match history, sessions and Analyzer keep their normal statistics; their
views hide the opening-condition control. Conditions are an optional view, not
a replacement for the current profile.

## Deployment

This extension needs only a frontend update when the round-conditions backend is
already deployed. No endpoint, schema or parser changes are introduced. Current
saved full phase payloads need no reparse; reparse older matches only if their
missing condition coverage is wanted. Dates, tags and friends are untouched.
