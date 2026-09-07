import hashlib
import json
from datetime import datetime, timezone

import mysql.connector

from .errors import ApiError, ValidationError


SIDES = ("T", "CT")


def _canonical_rules(rules):
    try:
        encoded = json.dumps(
            rules, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise ValidationError("Rules must contain finite JSON values.", "$.rules") from error
    return encoded, hashlib.sha256(encoded).digest()


def _existing_match(cursor, sha256_hex, faceit_id):
    cursor.execute("SELECT id FROM matches WHERE demo_sha256 = UNHEX(%s)", (sha256_hex,))
    sha_row = cursor.fetchone()
    provider_row = None
    if faceit_id:
        cursor.execute(
            "SELECT id FROM matches WHERE provider = 'faceit' AND provider_match_id = %s",
            (faceit_id,),
        )
        provider_row = cursor.fetchone()
    if sha_row and provider_row and sha_row[0] != provider_row[0]:
        raise ApiError(409, "identifier_conflict", "The demo hash and FACEIT ID belong to different stored matches.")
    return (sha_row or provider_row or (None,))[0]


def _parser_config(cursor, rules_json, rules_hash):
    cursor.execute(
        """
        INSERT INTO parser_configs (config_sha256, rules_json)
        VALUES (%s, %s)
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        """,
        (rules_hash, rules_json.decode("utf-8")),
    )
    config_id = cursor.lastrowid
    if not config_id:
        cursor.execute("SELECT id FROM parser_configs WHERE config_sha256 = %s", (rules_hash,))
        config_id = cursor.fetchone()[0]
    return config_id


def _global_player(cursor, steam_id, name, played_at):
    cursor.execute(
        """
        INSERT INTO players (steam_id, current_name, first_seen_at, last_seen_at)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          current_name = CASE
            WHEN VALUES(last_seen_at) IS NULL OR last_seen_at IS NULL OR VALUES(last_seen_at) >= last_seen_at
              THEN VALUES(current_name)
            ELSE current_name
          END,
          first_seen_at = CASE
            WHEN VALUES(first_seen_at) IS NULL THEN first_seen_at
            WHEN first_seen_at IS NULL THEN VALUES(first_seen_at)
            ELSE LEAST(first_seen_at, VALUES(first_seen_at))
          END,
          last_seen_at = CASE
            WHEN VALUES(last_seen_at) IS NULL THEN last_seen_at
            WHEN last_seen_at IS NULL THEN VALUES(last_seen_at)
            ELSE GREATEST(last_seen_at, VALUES(last_seen_at))
          END
        """,
        (steam_id, name, played_at, played_at),
    )
    return cursor.lastrowid


def import_match(connection, payload):
    identity = payload["id"]
    faceit_id = identity.get("faceit")
    sha256_hex = identity["sha256"].lower()
    rules_json, rules_hash = _canonical_rules(payload["rules"])
    played_at = None
    if payload.get("played_at") is not None:
        played_at = datetime.fromtimestamp(payload["played_at"], timezone.utc).replace(tzinfo=None)

    try:
        connection.start_transaction()
        with connection.cursor() as cursor:
            existing_id = _existing_match(cursor, sha256_hex, faceit_id)
            if existing_id:
                connection.rollback()
                return existing_id, False

            config_id = _parser_config(cursor, rules_json, rules_hash)
            cursor.execute(
                """
                INSERT INTO matches (
                  provider, provider_match_id, demo_sha256, payload_schema, nickstats_build,
                  parser_name, parser_version, parser_config_id, map_name, played_at,
                  played_at_source, rounds
                ) VALUES (%s, %s, UNHEX(%s), %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    "faceit" if faceit_id else None, faceit_id, sha256_hex, payload["schema"],
                    payload["nickstats_build"], payload["parser"][0], payload["parser"][1],
                    config_id, payload["map"], played_at, payload.get("played_at_source"),
                    payload["rounds"],
                ),
            )
            match_id = cursor.lastrowid

            team_ids = []
            player_to_team = {}
            for team_slot, team in enumerate(payload["teams"]):
                cursor.execute(
                    """
                    INSERT INTO match_teams (
                      match_id, team_slot, source_team_id, display_name, score,
                      t_round_wins, ct_round_wins
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (match_id, team_slot, team["id"], team["name"], team.get("score"),
                     team["side_scores"][0], team["side_scores"][1]),
                )
                team_ids.append(cursor.lastrowid)
                for player_slot in team["players"]:
                    player_to_team[player_slot] = team_slot

            match_player_ids = []
            for player_slot, player in enumerate(payload["players"]):
                is_bot = player.get("bot", False)
                player_id = None if is_bot else _global_player(
                    cursor, int(player["steam_id"]), player["name"], played_at
                )
                cursor.execute(
                    """
                    INSERT INTO match_players (
                      match_id, match_team_id, player_slot, player_id, display_name, is_bot
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (match_id, team_ids[player_to_team[player_slot]], player_slot,
                     player_id, player["name"], is_bot),
                )
                match_player_ids.append(cursor.lastrowid)

            for player_slot, player in enumerate(payload["players"]):
                actor_id = match_player_ids[player_slot]
                for side_index, stats in enumerate(player["sides"]):
                    side = SIDES[side_index]
                    rounds = stats["rounds"]
                    kda = stats["kda"]
                    opening = stats["opening"]
                    trade_d = stats["trade_d"]
                    utility = stats["utility"]
                    speed = stats["speed"]
                    cursor.execute(
                        """
                        INSERT INTO player_side_stats (
                          match_player_id, side, rounds_played, rounds_won,
                          kills, deaths, assists, headshots, damage, kast_rounds,
                          opening_kills, opening_deaths, trade_kills,
                          tradeable_deaths, attempted_tradeable_deaths, traded_deaths,
                          he_damage, fire_damage,
                          kill_speed_total, kill_speed_samples, kill_speed_max,
                          kill_speed_percent_total, kill_speed_percent_samples, kill_speed_percent_max,
                          death_speed_total, death_speed_samples, death_speed_max,
                          death_speed_percent_total, death_speed_percent_samples, death_speed_percent_max,
                          clutch_1v1, clutch_1v2, clutch_1v3, clutch_1v4, clutch_1v5,
                          kill_rounds_1k, kill_rounds_2k, kill_rounds_3k, kill_rounds_4k, kill_rounds_5k
                        ) VALUES (
                          %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                          %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                          %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                          %s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                        )
                        """,
                        (
                            actor_id, side, *rounds, *kda, stats["kast_rounds"], *opening,
                            stats["trade_kills"], *trade_d, *utility, *speed,
                            *stats["clutches"], *stats["kill_rounds"],
                        ),
                    )

                    if stats["weapons"]:
                        cursor.executemany(
                            """
                            INSERT INTO weapon_side_stats
                              (match_player_id, side, weapon, kills, shots, damage, rounds_used)
                            VALUES (%s,%s,%s,%s,%s,%s,%s)
                            """,
                            [(actor_id, side, *row) for row in stats["weapons"]],
                        )
                    if stats["duels"]:
                        cursor.executemany(
                            """
                            INSERT INTO duel_side_stats
                              (match_id, killer_match_player_id, victim_match_player_id, killer_side, kills)
                            VALUES (%s,%s,%s,%s,%s)
                            """,
                            [(match_id, actor_id, match_player_ids[row[0]], side, row[1])
                             for row in stats["duels"]],
                        )
                    if stats["trades"]:
                        cursor.executemany(
                            """
                            INSERT INTO trade_side_stats
                              (match_id, trader_match_player_id, teammate_match_player_id,
                               trader_side, opportunities, attempts, successes)
                            VALUES (%s,%s,%s,%s,%s,%s,%s)
                            """,
                            [(match_id, actor_id, match_player_ids[row[0]], side, *row[1:])
                             for row in stats["trades"]],
                        )
                    if stats["contexts"]:
                        cursor.executemany(
                            """
                            INSERT INTO kill_context_side_stats (
                              match_id, killer_match_player_id, victim_match_player_id, killer_side,
                              victim_blinded_kills, attacker_blind_kills, wallbang_kills,
                              penetration_total, smoke_kills, airborne_kills, moving_kills,
                              still_kills, running_kills, victim_grenade_out_kills,
                              victim_knife_out_kills, equipment_disadvantage_kills, unfair_kills
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                            """,
                            [(match_id, actor_id, match_player_ids[row[0]], side, *row[1:])
                             for row in stats["contexts"]],
                        )
                    if stats["assisted_by"]:
                        cursor.executemany(
                            """
                            INSERT INTO assisted_kill_side_stats (
                              match_id, beneficiary_match_player_id, assister_match_player_id,
                              beneficiary_side, damage_assisted_kills,
                              teammate_flash_assisted_kills, own_flash_kills
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                            """,
                            [(match_id, actor_id, match_player_ids[row[0]], side, *row[1:])
                             for row in stats["assisted_by"]],
                        )
                    if stats["flashes"]:
                        cursor.executemany(
                            """
                            INSERT INTO flash_side_stats (
                              match_id, thrower_match_player_id, victim_match_player_id,
                              thrower_side, flash_effects, blind_duration_ms
                            ) VALUES (%s,%s,%s,%s,%s,%s)
                            """,
                            [(match_id, actor_id, match_player_ids[row[0]], side, *row[1:])
                             for row in stats["flashes"]],
                        )

        connection.commit()
        return match_id, True
    except mysql.connector.IntegrityError as error:
        connection.rollback()
        if error.errno == 1062:
            with connection.cursor() as cursor:
                existing_id = _existing_match(cursor, sha256_hex, faceit_id)
            if existing_id:
                return existing_id, False
        raise
    except Exception:
        connection.rollback()
        raise
