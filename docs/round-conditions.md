# Profile round conditions — 2026.11.20.4

Individual player profiles now have an optional Round conditions filter alongside
side, buy, round-result, phase, map, date and tag filters. All keeps the ordinary
profile. Opening kill and Opening death select those player rounds; Attempted
combines those two disjoint cohorts. No attempt selects known rounds with neither.
"Attempted" follows the existing opening-attempt definition (opening kill/death),
not every shot fired before the first death.

Cards summarize full-round performance, including the opening itself and later
combat. Rating, ADR, K/D and KAST are recalculated from pooled selected player
rounds. Filtered win rate is round win rate; matching match counts include only
matches with a positive selected-round sample. Match score previews remain
whole-match scores. Filters intersect; hero rounds are included in All and can
be explicitly selected. The matching-round count is displayed beside the filter.

GET /players/:id/round-conditions reads existing player_round_phase_stats and
returns disjoint opening cohorts aggregated by actual side, buys, result, phase
and hero state. Statistics are sparse (zero counters are omitted), and each
slice retains its round numbers. No new migration is required. Normal profile
loads do not call this endpoint; the first condition selection fetches it, then
all opening choices share the response in that open profile. Profile refresh and
match-change events invalidate it. Failed loads have Retry and hide old cards
rather than presenting unfiltered statistics under a condition label.

Unknown/missing/invalid legacy player-round payloads are excluded from all opening
cohorts, including No attempt. Coverage is reported against the player's saved
round count. Current saved phase payloads need no reparse. Reparse older matches
only if their missing condition coverage is needed. The backend and frontend both
need deployment; movement captures, dates, tags and friends are untouched.

Supported cards use the stored full-round combat, opening, utility, movement,
clutch, initiation, weapon and objective counters. Event-timing/phase, alive-count
round-state and team-equipment-value cards are marked unavailable in this first
version, as are teammate trade breakdowns. They never reuse whole-match values or
silently display missing counters as zero. Empty samples show no rating.

This first filter applies to individual profile cards and map summaries. Quick
Comparison, Graphs, Groups, match history, sessions and Analyzer keep their normal
statistics. Conditions are a separate optional view, not a replacement for the
existing profile. The backend cohort slices and frontend matching helpers can
support additional condition families later.
