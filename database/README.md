# NickStats database

The initial database targets MySQL 8.0 and stores normalized, demo-derived match data. The browser's compact `nickstats.match/9` JSON is an import format, not a database document. A backend import must validate the complete payload first and insert all rows in one transaction.

## Why it is normalized

NickStats needs to filter matches by player, teammate combination, exclusion list, date, map, and side. Those operations are direct indexed joins when players and team membership are relational. Keeping only a JSON blob would make the most important comparison queries slower and considerably harder to validate.

Derived values are not stored. ALL-side totals are calculated from T + CT; ADR is damage / rounds; KAST is kast rounds / rounds; headshot percentage is headshots / kills; trade percentages use attempts as their denominator; rating is calculated with the formula belonging to the stored NickStats build. Speed maxima use the larger side value rather than adding both sides.

## Tables

| Table | Purpose |
|---|---|
| `schema_migrations` | Applied database schema versions |
| `parser_configs` | Deduplicated parser-rule JSON, identified by a canonical SHA-256 |
| `matches` | Match identity, parser version, map, date, and round count |
| `players` | Stable human identity keyed by Steam ID |
| `match_teams` | The two teams, final scores, and side-win totals |
| `match_players` | Match roster, match-time name, team, slot, and bot status |
| `player_side_stats` | Base T/CT counters used to derive scoreboard values |
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
| `sides[0]`, `sides[1]` | T and CT rows respectively |
| `rounds`, `kda`, `kast_rounds`, `opening`, `trade_kills`, `trade_d`, `utility`, `damage_received`, `utility_thrown`, `objectives`, `speed`, `clutches`, `clutch_attempts`, `kill_rounds` | Columns in `player_side_stats` |
| `weapons` | `weapon_side_stats` |
| `duels` | `duel_side_stats` |
| `trades` | `trade_side_stats` |
| `contexts` | `kill_context_side_stats` |
| `assisted_by` | `assisted_kill_side_stats` |
| `flashes` | `flash_side_stats` |

`played_at` is a UTC Unix timestamp in the compact payload. The importer converts it to a UTC MySQL `DATETIME`; a missing value remains null. Every backend connection must use UTC.

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

Apply numbered migrations once, in order. For example:

```bash
sudo mysql < database/migrations/002_clutch_attempts.sql
```

Migration 002 initializes attempt counts to the existing win counts because a win proves an attempt, but historical failed attempts cannot be reconstructed from the database. It also adds raw damage-received, utility-thrown, objective, and weapon-hit counters. Reparse existing matches to populate real values for all of these counters.
