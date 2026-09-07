import json
from datetime import datetime, timezone

from .errors import ApiError, ValidationError


SIDES = ("T", "CT")


def _unix_seconds(value):
    if value is None:
        return None
    return int(value.replace(tzinfo=timezone.utc).timestamp())


def _json_value(value):
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    return json.loads(value) if isinstance(value, str) else value


def _limit_offset(args):
    try:
        limit = int(args.get("limit", 25))
        offset = int(args.get("offset", 0))
    except ValueError as error:
        raise ValidationError("limit and offset must be integers.") from error
    if not 1 <= limit <= 100 or offset < 0:
        raise ValidationError("limit must be 1-100 and offset must be non-negative.")
    return limit, offset


def _date(value, name):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationError(f"{name} must be an ISO-8601 date or timestamp.", f"$.{name}") from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def list_matches(connection, args):
    limit, offset = _limit_offset(args)
    clauses = []
    values = []
    joins = ""
    if args.get("steam_id"):
        try:
            steam_id = int(args["steam_id"])
        except ValueError as error:
            raise ValidationError("steam_id must be numeric.", "$.steam_id") from error
        joins = " JOIN match_players mp_filter ON mp_filter.match_id = m.id JOIN players p_filter ON p_filter.id = mp_filter.player_id "
        clauses.append("p_filter.steam_id = %s")
        values.append(steam_id)
    if args.get("map"):
        clauses.append("m.map_name = %s")
        values.append(args["map"])
    date_from = _date(args.get("from"), "from")
    date_to = _date(args.get("to"), "to")
    if date_from:
        clauses.append("m.played_at >= %s")
        values.append(date_from)
    if date_to:
        clauses.append("m.played_at < %s")
        values.append(date_to)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
      SELECT DISTINCT m.id, m.provider, m.provider_match_id, LOWER(HEX(m.demo_sha256)) AS sha256,
             m.map_name, m.played_at, m.rounds, m.nickstats_build, m.created_at
      FROM matches m {joins} {where}
      ORDER BY m.played_at IS NULL, m.played_at DESC, m.id DESC
      LIMIT %s OFFSET %s
    """
    values.extend((limit, offset))
    with connection.cursor(dictionary=True) as cursor:
        cursor.execute(sql, tuple(values))
        rows = cursor.fetchall()
        match_ids = [row["id"] for row in rows]
        teams = {match_id: [] for match_id in match_ids}
        if match_ids:
            placeholders = ",".join(["%s"] * len(match_ids))
            cursor.execute(
                f"""
                SELECT match_id, team_slot, display_name, score
                FROM match_teams WHERE match_id IN ({placeholders})
                ORDER BY match_id, team_slot
                """,
                tuple(match_ids),
            )
            for team in cursor.fetchall():
                teams[team["match_id"]].append({
                    "name": team["display_name"], "score": team["score"]
                })
    return {
        "matches": [{
            "id": row["id"],
            "provider": row["provider"],
            "provider_match_id": row["provider_match_id"],
            "sha256": row["sha256"],
            "map": row["map_name"],
            "played_at": _unix_seconds(row["played_at"]),
            "rounds": row["rounds"],
            "nickstats_build": row["nickstats_build"],
            "teams": teams[row["id"]],
        } for row in rows],
        "limit": limit,
        "offset": offset,
    }


def list_players(connection, args):
    limit, offset = _limit_offset(args)
    query = args.get("q", "").strip()
    clauses = []
    values = []
    if query:
        clauses.append("(p.current_name LIKE %s OR CAST(p.steam_id AS CHAR) = %s)")
        values.extend((f"%{query}%", query))
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    values.extend((limit, offset))
    with connection.cursor(dictionary=True) as cursor:
        cursor.execute(
            f"""
            SELECT p.id, CAST(p.steam_id AS CHAR) AS steam_id, p.current_name,
                   p.first_seen_at, p.last_seen_at, COUNT(mp.id) AS match_count
            FROM players p
            LEFT JOIN match_players mp ON mp.player_id = p.id
            {where}
            GROUP BY p.id
            ORDER BY p.current_name, p.id
            LIMIT %s OFFSET %s
            """,
            tuple(values),
        )
        rows = cursor.fetchall()
    return {
        "players": [{
            "id": row["id"], "steam_id": row["steam_id"], "name": row["current_name"],
            "first_seen_at": _unix_seconds(row["first_seen_at"]),
            "last_seen_at": _unix_seconds(row["last_seen_at"]),
            "match_count": row["match_count"],
        } for row in rows],
        "limit": limit,
        "offset": offset,
    }


def get_match(connection, match_id):
    with connection.cursor(dictionary=True) as cursor:
        cursor.execute(
            """
            SELECT m.*, LOWER(HEX(m.demo_sha256)) AS sha256, pc.rules_json
            FROM matches m JOIN parser_configs pc ON pc.id = m.parser_config_id
            WHERE m.id = %s
            """,
            (match_id,),
        )
        match = cursor.fetchone()
        if not match:
            raise ApiError(404, "match_not_found", "Match not found.")

        cursor.execute(
            """
            SELECT id, team_slot, source_team_id, display_name, score,
                   t_round_wins, ct_round_wins
            FROM match_teams WHERE match_id = %s ORDER BY team_slot
            """,
            (match_id,),
        )
        team_rows = cursor.fetchall()
        cursor.execute(
            """
            SELECT mp.id, mp.match_team_id, mp.player_slot, mp.display_name, mp.is_bot,
                   CAST(p.steam_id AS CHAR) AS steam_id
            FROM match_players mp LEFT JOIN players p ON p.id = mp.player_id
            WHERE mp.match_id = %s ORDER BY mp.player_slot
            """,
            (match_id,),
        )
        player_rows = cursor.fetchall()
        internal_to_slot = {row["id"]: row["player_slot"] for row in player_rows}
        players = [{
            "name": row["display_name"],
            "steam_id": row["steam_id"],
            **({"bot": True} if row["is_bot"] else {}),
            "sides": [None, None],
        } for row in player_rows]

        cursor.execute("SELECT * FROM player_side_stats WHERE match_player_id IN (SELECT id FROM match_players WHERE match_id = %s)", (match_id,))
        stat_rows = cursor.fetchall()
        for row in stat_rows:
            slot = internal_to_slot[row["match_player_id"]]
            side_index = SIDES.index(row["side"])
            players[slot]["sides"][side_index] = {
                "rounds": [row["rounds_played"], row["rounds_won"]],
                "kda": [row["kills"], row["deaths"], row["assists"], row["headshots"], row["damage"]],
                "kast_rounds": row["kast_rounds"],
                "opening": [row["opening_kills"], row["opening_deaths"]],
                "trade_kills": row["trade_kills"],
                "trade_d": [row["tradeable_deaths"], row["attempted_tradeable_deaths"], row["traded_deaths"]],
                "utility": [row["he_damage"], row["fire_damage"]],
                "speed": [
                    float(row["kill_speed_total"]), row["kill_speed_samples"], _float_or_none(row["kill_speed_max"]),
                    float(row["kill_speed_percent_total"]), row["kill_speed_percent_samples"], _float_or_none(row["kill_speed_percent_max"]),
                    float(row["death_speed_total"]), row["death_speed_samples"], _float_or_none(row["death_speed_max"]),
                    float(row["death_speed_percent_total"]), row["death_speed_percent_samples"], _float_or_none(row["death_speed_percent_max"]),
                ],
                "clutches": [row[f"clutch_1v{i}"] for i in range(1, 6)],
                "kill_rounds": [row[f"kill_rounds_{i}k"] for i in range(1, 6)],
                "weapons": [], "duels": [], "trades": [], "contexts": [],
                "assisted_by": [], "flashes": [],
            }

        _attach_weapons(cursor, match_id, players, internal_to_slot)
        _attach_relationships(cursor, match_id, players, internal_to_slot)

    team_members = {row["id"]: [] for row in team_rows}
    for player in player_rows:
        team_members[player["match_team_id"]].append(player["player_slot"])
    return {
        "schema": match["payload_schema"],
        "nickstats_build": match["nickstats_build"],
        "parser": [match["parser_name"], match["parser_version"]],
        "id": {"faceit": match["provider_match_id"] if match["provider"] == "faceit" else None,
               "sha256": match["sha256"]},
        "map": match["map_name"],
        "played_at": _unix_seconds(match["played_at"]),
        "played_at_source": match["played_at_source"],
        "rounds": match["rounds"],
        "rules": _json_value(match["rules_json"]),
        "teams": [{
            "id": row["source_team_id"], "name": row["display_name"], "score": row["score"],
            "side_scores": [row["t_round_wins"], row["ct_round_wins"]],
            "players": team_members[row["id"]],
        } for row in team_rows],
        "players": players,
    }


def _float_or_none(value):
    return None if value is None else float(value)


def _attach_weapons(cursor, match_id, players, internal_to_slot):
    cursor.execute(
        """
        SELECT w.* FROM weapon_side_stats w JOIN match_players mp ON mp.id = w.match_player_id
        WHERE mp.match_id = %s ORDER BY mp.player_slot, w.side, w.weapon
        """,
        (match_id,),
    )
    for row in cursor.fetchall():
        stats = players[internal_to_slot[row["match_player_id"]]]["sides"][SIDES.index(row["side"])]
        stats["weapons"].append([row["weapon"], row["kills"], row["shots"], row["damage"], row["rounds_used"]])


def _attach_relationships(cursor, match_id, players, internal_to_slot):
    definitions = [
        ("duels", "SELECT * FROM duel_side_stats WHERE match_id = %s", "killer_match_player_id", "victim_match_player_id", "killer_side", ["kills"]),
        ("trades", "SELECT * FROM trade_side_stats WHERE match_id = %s", "trader_match_player_id", "teammate_match_player_id", "trader_side", ["opportunities", "attempts", "successes"]),
        ("contexts", "SELECT * FROM kill_context_side_stats WHERE match_id = %s", "killer_match_player_id", "victim_match_player_id", "killer_side", [
            "victim_blinded_kills", "attacker_blind_kills", "wallbang_kills", "penetration_total",
            "smoke_kills", "airborne_kills", "moving_kills", "still_kills", "running_kills",
            "victim_grenade_out_kills", "victim_knife_out_kills", "equipment_disadvantage_kills", "unfair_kills"
        ]),
        ("assisted_by", "SELECT * FROM assisted_kill_side_stats WHERE match_id = %s", "beneficiary_match_player_id", "assister_match_player_id", "beneficiary_side", [
            "damage_assisted_kills", "teammate_flash_assisted_kills", "own_flash_kills"
        ]),
        ("flashes", "SELECT * FROM flash_side_stats WHERE match_id = %s", "thrower_match_player_id", "victim_match_player_id", "thrower_side", ["flash_effects", "blind_duration_ms"]),
    ]
    for output_key, sql, actor_key, target_key, side_key, value_keys in definitions:
        cursor.execute(sql, (match_id,))
        for row in cursor.fetchall():
            actor_slot = internal_to_slot[row[actor_key]]
            stats = players[actor_slot]["sides"][SIDES.index(row[side_key])]
            stats[output_key].append([internal_to_slot[row[target_key]], *[row[key] for key in value_keys]])

