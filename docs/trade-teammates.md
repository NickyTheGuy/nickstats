# Teammate trade tables — 2026.11.20.5

The two Trades tables on any individual player profile show only teammates who
have played on the same team as that player in at least five distinct saved
matches. Eligibility uses their complete saved history; date, map, tag, result,
side and round filters do not change that threshold. Playing against someone
does not count, and no account ownership or friends list is required.

Map, date, tag and match-result filters supply the match IDs as before. Side,
own buy (including hero), enemy buy, round result, regulation/overtime and opening
round conditions now apply to both tables. All round filters refer to the selected
profile player's round, including when calculating incoming trades. For example,
full buy shows who traded the selected player on that player's full-buy rounds.
The teammate's own buy or opening outcome does not select the round.

The unfiltered/side-only path keeps the existing indexed trade_side_stats totals.
Round-filtered requests extract and sum the directional trade arrays from
player_round_phase_stats in MySQL. Full matches, movement and full round JSON are
not sent to the browser. Both tables share a bulk request, an abortable loading
state, and a short bounded cache keyed by all filters; match changes invalidate it.

Missing legacy per-round data contributes no filtered counters; it never falls
back to whole-match totals. Missing opening data is excluded from No attempt.
Current full saved round payloads already include directional trades: no new
migration or reparse is needed for those matches. Older missing round payloads
require reparsing only if that coverage is wanted. Deploy both backend and built
frontend for the new filters.
