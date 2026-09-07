import copy
import unittest

from nickstats_api.errors import ValidationError
from nickstats_api.validation import validate_match


def side(rounds=1):
    return {
        "rounds": [rounds, 0],
        "kda": [0, 0, 0, 0, 0],
        "kast_rounds": 0,
        "opening": [0, 0],
        "trade_kills": 0,
        "trade_d": [0, 0, 0],
        "utility": [0, 0],
        "speed": [0, 0, None, 0, 0, None, 0, 0, None, 0, 0, None],
        "clutches": [0, 0, 0, 0, 0],
        "kill_rounds": [0, 0, 0, 0, 0],
        "weapons": [],
        "duels": [],
        "trades": [],
        "contexts": [],
        "assisted_by": [],
        "flashes": [],
    }


def match_payload():
    return {
        "schema": "nickstats.match/9",
        "nickstats_build": "2026.09.06.25",
        "parser": ["@deademx/cs2", "4.0.0"],
        "id": {"faceit": "1-00000000-0000-0000-0000-000000000000", "sha256": "a" * 64},
        "map": "de_anubis",
        "played_at": None,
        "played_at_source": None,
        "rounds": 1,
        "rules": {
            "trade": [5, 250, 2, 96, 98, 57],
            "movement": [1, 34],
            "equipment_disadvantage_seconds": 2,
        },
        "teams": [
            {"id": "2", "name": "Alpha", "score": 1, "side_scores": [1, 0], "players": [0]},
            {"id": "3", "name": "Bravo", "score": 0, "side_scores": [0, 0], "players": [1]},
        ],
        "players": [
            {"name": "Alice", "steam_id": "76561198000000001", "sides": [side(), side(0)]},
            {"name": "Bob", "steam_id": "76561198000000002", "sides": [side(0), side()]},
        ],
    }


class MatchValidationTests(unittest.TestCase):
    def test_accepts_current_compact_shape(self):
        self.assertEqual(validate_match(match_payload())["schema"], "nickstats.match/9")

    def test_rejects_duplicate_team_membership(self):
        payload = match_payload()
        payload["teams"][1]["players"] = [0, 1]
        with self.assertRaises(ValidationError):
            validate_match(payload)

    def test_rejects_bad_relationship_index(self):
        payload = match_payload()
        payload["players"][0]["sides"][0]["duels"] = [[2, 1]]
        with self.assertRaises(ValidationError):
            validate_match(payload)

    def test_rejects_impossible_trade_counts(self):
        payload = match_payload()
        payload["players"][0]["sides"][0]["trades"] = [[1, 2, 1, 2]]
        with self.assertRaises(ValidationError):
            validate_match(payload)

    def test_allows_self_duel_and_match_scoped_bot(self):
        payload = match_payload()
        payload["players"][0]["sides"][0]["duels"] = [[0, 1]]
        payload["players"][1] = {"name": "BOT Bob", "bot": True, "sides": [side(0), side()]}
        validate_match(payload)


if __name__ == "__main__":
    unittest.main()
