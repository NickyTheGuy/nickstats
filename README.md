# NickStats

A local-first Counter-Strike 2 analysis application organized around three product views:

- **Match** — parse a CS2 `.dem`, FACEIT `.zst`, `.dem.gz`, or `.zip` and inspect the scoreboard, duels, trades, and weapons.
- **Compare** — database-backed teammate matrices, pairwise comparisons, and Included/Excluded lineup conditions.
- **Players** — personal summaries, splits, relationships, and match history.

Demo files are processed in the browser and are never uploaded. Match, Compare, and Players remain publicly browsable; the Match view requests the private upload token only when someone starts parsing a demo for automatic upload, and holds it only in memory. After a successful parse, the frontend automatically sends the compact `nickstats.match/9` result to the same-origin API; failed uploads can be retried and the JSON can still be downloaded manually. Compare and Players are currently database-ready empty states.

The visible date-based build number in the NickStats header is bumped with parser and interface deployments, making it easy to tell when a published host has received the newest version.

Demo statistics use the roster present when each round goes live as the denominator, so transient pre-freeze spawns do not count. Bots that enter live play remain separate, visibly labeled rows and are identified in JSON so future aggregate analysis can exclude them by default.

The Demo Parser's **ALL / CT / T** selector applies to the scoreboard, rating, KAST, trades, utility, kill context, clutches, multikills, weapon ledger, duel matrix, player round counts, and side wins. Side attribution uses each player's live team assignment for every completed round rather than splitting the match in half, so regulation and FACEIT overtime side swaps are handled directly. The demo is parsed once; changing the selector only switches among the stored aggregates.

The large demo outputs share a local **Scoreboard / Duels / Trades / Weapons** tab bar beneath the side selector. Changing result tabs does not discard the selected side or reparse the demo.

Parsed results include a FACEIT match ID extracted from an original FACEIT filename when available, plus a SHA-256 fingerprint of the uncompressed demo. `match_uid` prefers the provider ID and falls back to the fingerprint, while `demo_sha256` can always be used for exact duplicate detection.

## Run it

Open the published site, or clone/download the repository and serve the folder with any static web server. The demo parser is intended for an HTTPS-hosted version because its parser libraries are loaded from pinned CDN URLs.

## Match parsing

The Demo Parser tab uses [`@deademx/cs2` 4.0.0](https://github.com/Igor-Losev/deadem/tree/v4.0.0/packages/cs2) in a Web Worker. It reads kills, deaths, assists, headshots, damage, trade kills and deaths, trade opportunities and attempts, damage- and flash-assisted kills, confirmed own-flash kills, enemies flashed, flash assists, flash effects and applied blind duration by thrower and victim, HE and fire grenade damage, openings, exact 1K–5K rounds, 1v1–1v5 clutch wins, team assignments, the map, and round winners from the demo event stream. An own-flash kill means the enemy was actively blinded by a flash thrown by the killer; it does not mean the killer blinded themselves. This value is displayed separately and is not included in the collapsed Assisted K total. Flash relationships include enemies, teammates, and the thrower's own diagonal. Each `player_blind` effect contributes one flash and its reported blind duration, allowing total and average duration per affected player to be calculated later. It also tracks mirrored kill context: kills against blinded enemies and deaths while blind, wallbang and smoke kills/deaths, airborne kills and deaths to airborne killers, running kills/deaths, enemies caught with a grenade or knife active, and average horizontal killer speed. A Paul Kill/Death is one where the victim had a grenade or knife out at death or during the preceding two seconds. Bullshit Kills/Deaths uniquely count events where the killer was blind, airborne, or running, the kill was a wallbang or smoke kill, or the victim was caught for a Paul; overlapping contexts count once. Speed uses the pawn's networked velocity when present and otherwise derives it from horizontal position changes between demo packets. The scoreboard displays speed as a percentage of the held weapon's maximum movement speed, including scoped limits; values may exceed 100% after boosts or air movement. Grenade, lingering-fire, C4, and world kills are excluded because the killing weapon need not still be held. Raw units-per-second values remain in the JSON export. The JSON also records kills made while the attacker was blind and deaths to a blind attacker.

A running kill means the killer's horizontal speed exceeded **34% of the held weapon's maximum movement speed**, the point at which movement inaccuracy begins in the convention documented by [Leetify](https://leetify.com/blog/leetify-stats-glossary/). Separately, every speed-measured firearm kill is classified as **Moving** (above 1 Source 2 unit per second) or **Still** (at most 1 unit per second); the tolerance prevents tiny coordinate noise from labeling a stationary player as moving. The collapsed Kill Context column shows **Bullshit K-D**: unique kills/deaths where the killer was blind, airborne, or running, the kill was a wallbang or smoke kill, or the victim was caught for a Paul. A Paul is a kill/death where the victim had a grenade or knife out at death or within the preceding two seconds. A single event matching several conditions counts only once. Airborne and running appear in both Context, where they explain the composite, and Movement, where they sit alongside the detailed speed and movement-state statistics.

Side-specific ADR records each enemy-damage event directly into the attacker's live CT or T bucket. Its numerator and rounds-played denominator therefore cover the same side rather than reconstructing side damage from a later full-match total. Damage is reconstructed from the victim's tracked health before and after each `player_hurt` event, capping lethal overkill at the health actually removed. The corrected amount is also used for weapon and grenade damage. A round stops accepting live combat events immediately at `round_end`, preventing post-round damage from entering CT/T totals after that round's denominator has already been finalized. Raw corrected damage is included in each JSON player aggregate for validation.

Each player also receives a per-weapon ledger containing enemy kills, enemy health damage, `weapon_fire` events, and **Rounds Used**. Active attacks count immediately. An unused gun counts for the player holding its physical weapon entity immediately before death or at round end. Tracking the weapon handle rather than pickup events means a transfer gives passive credit to the recipient, regardless of when it was dropped, while refunded and abandoned items receive none. Each player/weapon combination counts at most once per completed round. A shotgun firing event counts as one shot rather than one per pellet.

Default pistols (Glock, USP-S, and P2000) and the knife use a stricter definition because every player spawns with them. Knife and grenades remain activity-only. A retained default pistol receives passive credit only when the player has no primary weapon or alternate pistol—for example, an unarmed pistol-round player who dies before firing.

Weapon player cards are expandable, retain their open state across ALL/CT/T changes, and have independently sortable Weapon, Kills, Shots, Damage, and Rounds Used columns. Each column toggles between its useful sort direction and the parser's original order.

Pickup, equip, and even damage events sometimes use the shared `hkp2000` family label for both CT starting pistols. NickStats learns each player's CT pistol choice from the explicit item definition index—USP-S (61), P2000 (32)—or unambiguous combat events, retains it across rounds, and routes ambiguous inventory/damage events to that choice. An unindexed `hkp2000` inventory event cannot create a P2000 statistic by itself.

The duel ledger records every kill/death pairing and its differential. Enemy kills and teamkills are directional player matchups. Explicit suicides and deaths without a resolved player attacker—such as falling or map hazards—are treated as self-kills, matching Counter-Strike's scoreboard convention. Demo-local user ID `0` remains a valid player when it resolves to the roster and is not confused with the world attacker. The browser renders this as one matrix: rows are players, columns are other players, and each cell is the row player's kills-deaths against that player. A self-kill appears on the diagonal as `0-1`, and team boundaries remain visually separated. Blank cells mean no such event occurred. In CT or T view, each row is filtered to the side played by that row's player when the duel event occurred.

The trade-response matrix breaks the aggregate trade model down by teammate. Rows are potential traders, columns are the teammates whose deaths they could respond to, and same-team cells display `opportunities / attempts / successes`. Opposing-team and self cells are blank. Like the scoreboard and duel matrix, the trade matrix follows the ALL / CT / T selector using the potential trader's side when the response occurred.

Scoreboard headers are sortable within each team. Composite headers cycle through their component statistics and then return to the original neutral order; single-stat headers toggle between that statistic and neutral. Favorable values sort first, so death-based penalty columns use fewer-first ordering.

The first trade-opportunity model is intentionally simple and transparent. A living teammate receives an opportunity when they are within 250 Source 2 game units of a teammate at the moment that teammate dies. This radius was calibrated against a known Leetify match result. A teammate outside that radius also receives a retroactive, proven opportunity if they damage or kill the killer within five seconds. Damaging the killer is an attempt; killing that player is a success. Success percentage uses attempts—not opportunities—as its denominator. A death is “tradeable” if at least one teammate met either rule, and it is counted only once regardless of how many teammates qualify. Its death-side attempt and success also count once even if multiple teammates act.

Nonlethal HE damage proves an attempt only when the target's reconstructed pre-hit health was within the HE's theoretical maximum: 98 damage without armor or 57 with armor. Nonlethal incendiary, Molotov, flash, decoy, and smoke damage does not independently prove a trade attempt; a resulting kill still counts as a success. The initial proximity test is straight-line 3D distance and does not yet account for walls, sightlines, weapons, or movement paths. The parsed JSON includes the active thresholds and definitions under `trade_definition`.

The five-second window determines whether a trade engagement can begin. A bullet path passing within 96 units of the original killer counts as an attempt even if the shot misses. Once established, qualifying fire or damage from either side refreshes the engagement; it expires after a two-second lull. A kill of the original killer during that uninterrupted exchange remains a trade even when the fight lasts longer than five seconds. Bullet paths use the shooter, impact, and player positions recorded in the demo. They are an approximation and can still misidentify unusually aligned players without full map collision geometry.

KAST's traded-round component uses this same qualified trade-success event. It does not maintain a separate looser trade definition.

Trade calibration traces remain available while a demo is being parsed but are deliberately omitted from the normal download. They are diagnostic data rather than match statistics and were the single largest avoidable part of stored results.

## Compact match JSON

**Download compact JSON** writes the versioned `nickstats.match/9` storage schema. It is minified and normalized for a future match database rather than being a dump of the browser's display object. Player identity is stored once, while relationship entries reference the match-level player index.

NickStats also exposes **Download round diagnostics** after every successful parse. This separate JSON traces each completed round's end event, raw or inferred winner side, game-rules and team-score evidence, bomb and alive-state inference, frozen player-side assignments, participant set, awarded round wins, stable team winner, and delayed end events. It is intentionally excluded from match uploads and normal compact downloads.

FACEIT Zstandard (`.zst`) demos are decompressed locally with the pinned `fzstd` browser decoder before parsing. The filename beneath `.zst` is retained for FACEIT match-ID detection, but the Zstandard frame does not contain an original-file timestamp, so `played_at` remains `null`. ZIP archives are also accepted directly: NickStats locates their `.dem` entry and uses its extended Unix modification time when available (`zip_extended_mtime`), falling back to `zip_dos_time`. For `.dem.gz`, the gzip original-file modification time is stored as `gzip_mtime`. Available times are saved in Unix seconds as `played_at`, with provenance in `played_at_source`, and displayed in the viewer's local time zone. CS2's demo payload and FACEIT's UUID do not themselves contain a calendar timestamp, so an extracted `.dem` likewise stores `null` rather than using an unreliable local download time. A future backend can supply authoritative FACEIT match metadata keyed by match ID.

Each player has a `sides` array in T, CT order. The full-match view is deliberately not stored: every ALL counter and relationship can be reconstructed by merging those two side records, using the maximum rather than the sum for speed maxima. Fixed arrays use these layouts:

- `rounds`: played, won
- `kda`: kills, deaths, assists, headshots, damage
- `opening`: kills, deaths
- `trade_kills`: unique trade kills; opportunities and attempts come from summing `trades`
- `trade_d`: tradeable deaths, attempted tradeable deaths, traded deaths
- `utility`: HE damage, fire damage
- `clutches`: 1v1 through 1v5 wins
- `kill_rounds`: 1K through 5K rounds
- `weapons`: weapon, kills, shots, damage, rounds used
- `duels`: opponent player index, kills
- `trades`: teammate player index, opportunities, attempts, successes
- `contexts`: victim player index, blinded victim, blind attacker, wallbang, penetration count, smoke, airborne, moving, still, running, grenade out, knife out, unique equipment disadvantage, unique unfair
- `assisted_by`: assister player index, damage-assisted kills, teammate flash-assisted kills, confirmed own-flash kills
- `flashes`: blinded player index, flash effects, applied blind duration in milliseconds

`duels` stores only the killer-to-victim direction. Transposing those entries reconstructs deaths to other players; subtracting all incoming player kills from the victim's K-D-A death counter reconstructs genuine self/world deaths for the diagonal. For side views, opposing-team deaths use the opposite side's incoming kills and teamkill deaths use the same side.

`contexts` is stored only from killer to victim. Summing a player's rows reconstructs their kill-side context totals; transposing entries that point to that player reconstructs their mirrored death totals. `assisted_by` is stored from the player receiving the assisted kill to the assister. An own-flash relationship therefore appears on the player's diagonal in a future assisted-kill matrix, while ordinary damage and teammate-flash assists remain off-diagonal. The collapsed Assisted K total uses only ordinary damage and teammate-flash assists. `flashes` is stored from thrower to affected player, including self and teammates. Enemy-flash totals are reconstructed by summing only entries whose target is on the opposing team; average duration is total milliseconds divided by flash effects. This preserves everything needed for future context, assisted-kill, and flash-effect matrices without duplicating both directions or the enemies-flashed aggregate. `speed` stores raw total, sample count, maximum, percent-of-maximum total, percent sample count, and percent maximum for kills, followed by the same six values for deaths.

ADR, KAST percentage, headshot percentage, rating, trade percentages, duel differential, assisted-kill totals, flash-assist totals, kill-context totals, utility totals, multikill totals, `traded_by`, and textual definition blocks are not stored because they can be reconstructed from these counters and the schema/build version. Match-level and per-player trade audits are also excluded. Runtime rendering still uses the full readable object, so compact storage does not change the visible scoreboard.

The displayed preview rating uses the commonly published HLTV Rating 2.0 approximation:

```
Impact = 2.13 × KPR + 0.42 × APR − 0.41
Rating = 0.0073 × KAST + 0.3591 × KPR − 0.5329 × DPR
       + 0.2372 × Impact + 0.0032 × ADR + 0.1587
```

It is an approximation rather than a rating supplied by Valve or FACEIT. Parsing support can lag behind Counter-Strike demo format changes.

If a demo contains no recognizable completed rounds, the app offers a small diagnostics JSON download. It contains parser, packet, and event counts—not demo contents or player names.

## Files

- `index.html` — interface markup
- `styles.css` — presentation
- `js/navigation.js` — Match, Compare, and Players navigation
- `js/demo.js` — demo upload, worker control, and scoreboard rendering
- `js/demo-worker.js` — local CS2 demo parsing and aggregation
- `database/schema.sql` — normalized MySQL schema
- `database/README.md` — storage model and compact JSON import mapping
- `backend/` — Swift/Vapor compact importer, public MySQL read API, container files, and deployment notes
- `THIRD_PARTY_NOTICES.md` — parser dependency attribution
