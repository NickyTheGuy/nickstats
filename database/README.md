# NickStats database

The initial database targets MySQL 8.0 and stores normalized, demo-derived match data. The browser's compact `nickstats.match/21` JSON is an import format, not a database document. A backend import must validate the complete payload first and insert all rows in one transaction.

## Why it is normalized

NickStats needs to filter matches by player, teammate combination, exclusion list, date, map, and side. Those operations are direct indexed joins when players and team membership are relational. Keeping only a JSON blob would make the most important comparison queries slower and considerably harder to validate.

Derived values are not stored. ALL-side totals are calculated from T + CT; ADR is damage / rounds; KAST is kast rounds / rounds; headshot percentage is headshots / kills; trade percentages use attempts as their denominator; rating is calculated with the formula belonging to the stored NickStats build. Speed maxima use the larger side value rather than adding both sides.

## Tables

| Table | Purpose |
|---|---|
| `schema_migrations` | Applied database schema versions |
| `parser_configs` | Deduplicated parser-rule JSON, identified by a canonical SHA-256 |
| `auth_users` | Login usernames with salted one-way password hashes and an optional representative player |
| `matches` | Match identity, parser version, map, date, and round count |
| `players` | Stable human identity keyed by Steam ID |
| `match_teams` | The two teams, final scores, and side-win totals |
| `match_players` | Match roster, match-time name, team, slot, and bot status |
| `match_rounds` | Live-start/end ticks, winner, bomb timing, survivors, and freeze-end T/CT economy for each parsed round |
| `death_events` | One factual row per player death, supporting both kill and death timing analysis |
| `player_side_stats` | Base T/CT counters used to derive scoreboard values |
| `player_economy_matchup_stats` | Sparse player counters by own buy, opponent buy, round result, and side |
| `weapon_side_stats` | Weapon counters by player and side |
| `duel_side_stats` | Directional killer-to-victim counts |
| `trade_side_stats` | Directional trader-to-fallen-teammate opportunities, attempts, and successes |
| `kill_context_side_stats` | Directional unfair/context kills from killer to victim |
| `assisted_kill_side_stats` | Kill beneficiary to assister relations, including own-flash diagonal entries |
| `flash_side_stats` | Flash thrower to affected-player effects and blind duration |

Bots remain match-scoped in `match_players` with a null global `player_id`. Human players resolve through the unique Steam ID in `players`. Match-time names remain on `match_players`, so a later nickname change does not rewrite history.

Self-kills, teamkills, own-flash kills, self-flashes, and team flashes are intentionally valid relationship rows. Only trades prohibit a self relationship.

## Compact JSON mapping

Each compact player has a match-level array index. Importers first create all `match_players`, then use that index map when importing relation arrays.

| Compact field | Destination |
|---|---|
| `id.faceit`, `id.sha256` | `matches.provider_match_id`, `matches.demo_sha256` |
| `schema`, `nickstats_build`, `parser` | Version columns on `matches` |
| `rules` | Canonical JSON in `parser_configs` |
| `teams[]` | `match_teams` and its player-index membership |
| `players[]` | `players` plus `match_players` |
| `round_economy` | Equipment values, roster sizes, pistol flag, and side-to-team identity on `match_rounds` |
| `sides[0]`, `sides[1]` | T and CT rows respectively |
| `economy_matchups` | `player_economy_matchup_stats` |
| `rounds`, `kda`, `kast_rounds`, `opening`, `trade_kills`, `trade_d`, `utility`, `damage_received`, `utility_thrown`, `objectives`, `speed`, `clutches`, `clutch_attempts`, `kill_rounds`, `true_kill_rounds`, `true_multikill_rounds` | Columns in `player_side_stats` |
| `weapons` | `weapon_side_stats` |
| `duels` | `duel_side_stats` |
| `trades` | `trade_side_stats` |
| `contexts` | `kill_context_side_stats` |
| `assisted_by` | `assisted_kill_side_stats` |
| `flashes` | `flash_side_stats` |

`played_at` is a UTC Unix timestamp in the compact payload. The importer converts it to a UTC MySQL `DATETIME`; a missing value remains null. Every backend connection must use UTC.

`death_events.elapsed_ms` is measured from `round_freeze_end`. Phase summaries are derived as Early (0–25 seconds, pre-plant), Mid (25–75 seconds, pre-plant), Late (75+ seconds, pre-plant), and Post-plant. The raw event also retains time since plant and T/CT alive counts, so these definitions can evolve without reparsing.

`context_flags` is a bit mask: 1 headshot, 2 wallbang, 4 smoke, 8 blind attacker, 16 airborne attacker, 32 running attacker, 64 blinded victim, 128 Paul/equipment disadvantage, and 256 the unique Bullshit composite.

## Duplicate handling

`matches.demo_sha256` is always unique. `(provider, provider_match_id)` is also unique when a provider ID exists. An upload matching either identifier is the same match and normally returns the existing record. An authenticated `POST /matches?replace=true` atomically replaces that match's imported data while preserving its database ID; a failed replacement rolls the transaction back to the prior version.

## Lineup-query shape

Included/Excluded comparisons operate on `match_players`, not statistics rows. The backend first finds a `match_team_id` containing every Included global `player_id`, then rejects any candidate containing an Excluded player. Only after that does it join the qualifying match-player rows to side statistics. The two membership indexes on `match_players` support both directions of this query: a player's match history and the complete roster of a particular match team.

This also handles the five-Included-player shortcut naturally. Once five distinct humans are required on a normal team, no additional friend can be present; no special data representation is needed.

## Applying the schema

From the repository root on the server, an authorized MySQL administrator can run:

```bash
sudo mysql < database/schema.sql
```

The file creates only the `nickstats` database and its tables. It does not create a MySQL user, change global server settings, or touch any other database. The Docker network must be inspected before creating the application user so its allowed MySQL host can be restricted correctly instead of using `%`.

Before any later migration, back up the database. New changes will be added as numbered migration files rather than editing an already-applied production migration in place.

Apply numbered migrations once, in order, to an existing database. Do not run them after a fresh import of the current `schema.sql`, because that file already contains and records the current schema. For example, using the same remote/container connection that successfully reaches MySQL:

```bash
sudo mysql < database/migrations/002_clutch_attempts.sql
```

Migration 002 initializes attempt counts to the existing win counts because a win proves an attempt, but historical failed attempts cannot be reconstructed from the database. It also adds raw damage-received, utility-thrown, objective, and weapon-hit counters. Reparse existing matches to populate real values for all of these counters.

Migration 003 adds factual round timing and death-event tables. Apply it before deploying the timing-enabled backend, then reparse matches to populate timing data; older schema-9 matches remain readable. Timing-rate denominators include only schema-10/11/12 matches with timing rows for every completed round, so old or incomplete data cannot quietly dilute the new rates.

Migration 004 adds nullable T/CT round-end survivor counts. New schema-11 uploads populate them; existing rows remain null until their demos are reparsed.

Migration 005 adds nullable freeze-time equipment values, live roster sizes, the pistol-round marker, and stable T/CT team references. New schema-12 uploads populate them; existing rows remain readable and show no economy breakdown until reparsed.

Migration 008 adds unique assisted-opening counts and their overlapping damage/flash attribution. Existing rows initialize to zero; reparse their demos to populate the new metrics and recover flash assists hidden by CS2's single-assister death event.

Migration 009 adds traded opening deaths, opening trade kills, and opening assists credited to the teammate who supplied damage or a flash. Existing rows initialize to zero; reparse their demos to populate schema-16 attribution.

Migration 010 adds opening kill/death blind context and enemy-assisted opening-death attribution. Existing rows initialize to zero but remain excluded from these schema-17 metrics until their demos are reparsed.

Migration 011 adds sparse player statistics keyed by both teams' buy types, round result, and side. Existing matches remain readable but are excluded whenever an enemy-buy filter is active; reparse them to populate schema-18 matchup data.

Migration 012 adds the active flash source behind blinded opening kills and deaths: the killer, a killer-side teammate, the victim's side (including self-flashes), or unavailable. Source categories may overlap when multiple flashes are active. Existing matches remain readable but are excluded from these schema-19 source metrics until reparsed.

Migration 014 adds database-backed login accounts. Accounts listed in `NICKSTATS_LOGIN_USERS` are inserted with a salted PBKDF2-HMAC-SHA256 password hash on their first successful login. Once inserted, the database password is authoritative and can be changed by the user without editing `.env`.

Migration 015 lets each login select the database player that represents them. The nullable foreign key is cleared automatically if that player is ever deleted.
