import re

from .errors import ValidationError


SCHEMA = "nickstats.match/9"
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
STEAM_ID_MAX = 18_446_744_073_709_551_615
SIDES = ("T", "CT")


def _fail(path, message):
    raise ValidationError(message, path)


def _dict(value, path):
    if not isinstance(value, dict):
        _fail(path, "Expected an object.")
    return value


def _list(value, path, length=None):
    if not isinstance(value, list):
        _fail(path, "Expected an array.")
    if length is not None and len(value) != length:
        _fail(path, f"Expected exactly {length} values.")
    return value


def _string(value, path, maximum=255, nullable=False):
    if nullable and value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        _fail(path, "Expected a non-empty string.")
    if len(value) > maximum:
        _fail(path, f"Must be at most {maximum} characters.")
    return value


def _int(value, path, maximum=4_294_967_295, nullable=False):
    if nullable and value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > maximum:
        _fail(path, f"Expected an integer from 0 to {maximum}.")
    return value


def _number(value, path, nullable=False):
    if nullable and value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        _fail(path, "Expected a non-negative number.")
    return value


def _counts(value, path, length, maximum=65_535):
    values = _list(value, path, length)
    for index, item in enumerate(values):
        _int(item, f"{path}[{index}]", maximum)
    return values


def _target_rows(value, path, row_length, player_count, validator=None):
    rows = _list(value, path)
    seen = set()
    for row_index, row in enumerate(rows):
        row_path = f"{path}[{row_index}]"
        row = _list(row, row_path, row_length)
        target = _int(row[0], f"{row_path}[0]", max(0, player_count - 1))
        if target in seen:
            _fail(row_path, "Duplicate target player index.")
        seen.add(target)
        if validator:
            validator(row, row_path, target)
        else:
            for index, item in enumerate(row[1:], 1):
                _int(item, f"{row_path}[{index}]", 4_294_967_295)
    return rows


def validate_match(payload):
    root = _dict(payload, "$.")
    if root.get("schema") != SCHEMA:
        _fail("$.schema", f"Only {SCHEMA} is supported.")
    _string(root.get("nickstats_build"), "$.nickstats_build", 32)
    parser = _list(root.get("parser"), "$.parser", 2)
    _string(parser[0], "$.parser[0]", 64)
    _string(parser[1], "$.parser[1]", 32)

    identity = _dict(root.get("id"), "$.id")
    _string(identity.get("faceit"), "$.id.faceit", 128, nullable=True)
    sha = identity.get("sha256")
    if not isinstance(sha, str) or not SHA256_RE.fullmatch(sha):
        _fail("$.id.sha256", "Expected a 64-character hexadecimal SHA-256.")

    _string(root.get("map"), "$.map", 64)
    _int(root.get("played_at"), "$.played_at", 32_503_680_000, nullable=True)
    _string(root.get("played_at_source"), "$.played_at_source", 32, nullable=True)
    rounds = _int(root.get("rounds"), "$.rounds", 255)
    if rounds == 0:
        _fail("$.rounds", "A match must contain at least one round.")
    rules = _dict(root.get("rules"), "$.rules")
    trade_rules = _list(rules.get("trade"), "$.rules.trade", 6)
    movement_rules = _list(rules.get("movement"), "$.rules.movement", 2)
    for index, value in enumerate(trade_rules):
        _number(value, f"$.rules.trade[{index}]")
    for index, value in enumerate(movement_rules):
        _number(value, f"$.rules.movement[{index}]")
    _number(rules.get("equipment_disadvantage_seconds"), "$.rules.equipment_disadvantage_seconds")

    players = _list(root.get("players"), "$.players")
    if not 2 <= len(players) <= 32:
        _fail("$.players", "Expected between 2 and 32 match players.")

    teams = _list(root.get("teams"), "$.teams", 2)
    memberships = {}
    team_source_ids = set()
    for team_index, team in enumerate(teams):
        path = f"$.teams[{team_index}]"
        team = _dict(team, path)
        team_source_id = _string(team.get("id"), f"{path}.id", 32)
        if team_source_id in team_source_ids:
            _fail(f"{path}.id", "Team IDs must be unique within a match.")
        team_source_ids.add(team_source_id)
        _string(team.get("name"), f"{path}.name", 128)
        _int(team.get("score"), f"{path}.score", 255, nullable=True)
        _counts(team.get("side_scores"), f"{path}.side_scores", 2, 255)
        member_indexes = _list(team.get("players"), f"{path}.players")
        if not member_indexes:
            _fail(f"{path}.players", "A team must contain at least one player.")
        for member_pos, player_index in enumerate(member_indexes):
            member_path = f"{path}.players[{member_pos}]"
            player_index = _int(player_index, member_path, len(players) - 1)
            if player_index in memberships:
                _fail(member_path, "A player may belong to only one team.")
            memberships[player_index] = team_index
    if len(memberships) != len(players):
        _fail("$.teams", "Every player must belong to exactly one team.")

    human_steam_ids = set()
    for player_index, player in enumerate(players):
        path = f"$.players[{player_index}]"
        player = _dict(player, path)
        _string(player.get("name"), f"{path}.name", 128)
        is_bot = player.get("bot", False)
        if not isinstance(is_bot, bool):
            _fail(f"{path}.bot", "Expected true or false.")
        steam_id = player.get("steam_id")
        if is_bot:
            if steam_id not in (None, ""):
                _fail(f"{path}.steam_id", "Bots cannot have a global Steam ID.")
        else:
            try:
                numeric_steam_id = int(steam_id)
            except (TypeError, ValueError):
                _fail(f"{path}.steam_id", "A human player requires a numeric Steam ID.")
            if str(numeric_steam_id) != str(steam_id) or not 1 <= numeric_steam_id <= STEAM_ID_MAX:
                _fail(f"{path}.steam_id", "Steam ID is outside the unsigned 64-bit range.")
            if numeric_steam_id in human_steam_ids:
                _fail(f"{path}.steam_id", "A human Steam ID may appear only once per match.")
            human_steam_ids.add(numeric_steam_id)

        sides = _list(player.get("sides"), f"{path}.sides", 2)
        for side_index, stats in enumerate(sides):
            side_path = f"{path}.sides[{side_index}]"
            stats = _dict(stats, side_path)
            side_rounds = _counts(stats.get("rounds"), f"{side_path}.rounds", 2)
            if side_rounds[1] > side_rounds[0]:
                _fail(f"{side_path}.rounds", "Round wins cannot exceed rounds played.")
            _counts(stats.get("kda"), f"{side_path}.kda", 5, 4_294_967_295)
            kast = _int(stats.get("kast_rounds"), f"{side_path}.kast_rounds", 65_535)
            if kast > side_rounds[0]:
                _fail(f"{side_path}.kast_rounds", "KAST rounds cannot exceed rounds played.")
            _counts(stats.get("opening"), f"{side_path}.opening", 2)
            _int(stats.get("trade_kills"), f"{side_path}.trade_kills", 65_535)
            trade_d = _counts(stats.get("trade_d"), f"{side_path}.trade_d", 3)
            if not trade_d[2] <= trade_d[1] <= trade_d[0]:
                _fail(f"{side_path}.trade_d", "Expected traded <= attempted <= tradeable deaths.")
            _counts(stats.get("utility"), f"{side_path}.utility", 2, 4_294_967_295)
            speed = _list(stats.get("speed"), f"{side_path}.speed", 12)
            for speed_index, value in enumerate(speed):
                if speed_index in (2, 5, 8, 11):
                    _number(value, f"{side_path}.speed[{speed_index}]", nullable=True)
                elif speed_index in (1, 4, 7, 10):
                    _int(value, f"{side_path}.speed[{speed_index}]", 65_535)
                else:
                    _number(value, f"{side_path}.speed[{speed_index}]")
            _counts(stats.get("clutches"), f"{side_path}.clutches", 5)
            _counts(stats.get("kill_rounds"), f"{side_path}.kill_rounds", 5)

            weapons = _list(stats.get("weapons"), f"{side_path}.weapons")
            weapon_names = set()
            for weapon_index, weapon in enumerate(weapons):
                weapon_path = f"{side_path}.weapons[{weapon_index}]"
                weapon = _list(weapon, weapon_path, 5)
                name = _string(weapon[0], f"{weapon_path}[0]", 64)
                if name in weapon_names:
                    _fail(weapon_path, "Duplicate weapon.")
                weapon_names.add(name)
                _int(weapon[1], f"{weapon_path}[1]", 65_535)
                _int(weapon[2], f"{weapon_path}[2]", 4_294_967_295)
                _int(weapon[3], f"{weapon_path}[3]", 4_294_967_295)
                _int(weapon[4], f"{weapon_path}[4]", 65_535)

            def validate_duel(row, row_path, _target):
                kills = _int(row[1], f"{row_path}[1]", 65_535)
                if kills == 0:
                    _fail(row_path, "A duel row must contain at least one kill.")

            _target_rows(stats.get("duels"), f"{side_path}.duels", 2, len(players), validate_duel)

            def validate_trade(row, row_path, target):
                if target == player_index:
                    _fail(row_path, "A player cannot trade for themselves.")
                if memberships[target] != memberships[player_index]:
                    _fail(row_path, "A trade target must be a teammate.")
                for index in range(1, 4):
                    _int(row[index], f"{row_path}[{index}]", 65_535)
                if not row[3] <= row[2] <= row[1]:
                    _fail(row_path, "Expected successes <= attempts <= opportunities.")

            _target_rows(stats.get("trades"), f"{side_path}.trades", 4, len(players), validate_trade)
            def validate_small_counts(row, row_path, _target):
                for index in range(1, len(row)):
                    _int(row[index], f"{row_path}[{index}]", 65_535)

            _target_rows(stats.get("contexts"), f"{side_path}.contexts", 14, len(players), validate_small_counts)
            _target_rows(stats.get("assisted_by"), f"{side_path}.assisted_by", 4, len(players), validate_small_counts)

            def validate_flash(row, row_path, _target):
                _int(row[1], f"{row_path}[1]", 65_535)
                _int(row[2], f"{row_path}[2]", 4_294_967_295)
                if row[1] == 0 and row[2] == 0:
                    _fail(row_path, "A flash row must contain an effect or duration.")

            _target_rows(stats.get("flashes"), f"{side_path}.flashes", 3, len(players), validate_flash)

    return root
