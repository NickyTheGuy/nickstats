USE nickstats;

ALTER TABLE player_side_stats
  ADD COLUMN damage_received INT UNSIGNED NOT NULL DEFAULT 0 AFTER damage,
  ADD COLUMN he_grenades_thrown SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER fire_damage,
  ADD COLUMN flashbangs_thrown SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER he_grenades_thrown,
  ADD COLUMN smokes_thrown SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER flashbangs_thrown,
  ADD COLUMN fire_grenades_thrown SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER smokes_thrown,
  ADD COLUMN decoys_thrown SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER fire_grenades_thrown,
  ADD COLUMN bomb_plants SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER decoys_thrown,
  ADD COLUMN bomb_defuses SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER bomb_plants,
  ADD COLUMN clutch_attempt_1v1 SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER clutch_1v5,
  ADD COLUMN clutch_attempt_1v2 SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER clutch_attempt_1v1,
  ADD COLUMN clutch_attempt_1v3 SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER clutch_attempt_1v2,
  ADD COLUMN clutch_attempt_1v4 SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER clutch_attempt_1v3,
  ADD COLUMN clutch_attempt_1v5 SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER clutch_attempt_1v4;

-- Existing data contains wins but cannot reconstruct failed attempts. Preserve
-- the known minimum until those matches are reparsed with the current parser.
UPDATE player_side_stats SET
  clutch_attempt_1v1 = clutch_1v1,
  clutch_attempt_1v2 = clutch_1v2,
  clutch_attempt_1v3 = clutch_1v3,
  clutch_attempt_1v4 = clutch_1v4,
  clutch_attempt_1v5 = clutch_1v5;

ALTER TABLE player_side_stats
  ADD CONSTRAINT chk_player_side_stats_clutches CHECK (
    clutch_1v1 <= clutch_attempt_1v1 AND clutch_1v2 <= clutch_attempt_1v2 AND
    clutch_1v3 <= clutch_attempt_1v3 AND clutch_1v4 <= clutch_attempt_1v4 AND
    clutch_1v5 <= clutch_attempt_1v5 AND
    clutch_attempt_1v1 + clutch_attempt_1v2 + clutch_attempt_1v3 +
      clutch_attempt_1v4 + clutch_attempt_1v5 <= rounds_played
  );

ALTER TABLE weapon_side_stats
  ADD COLUMN hits INT UNSIGNED NOT NULL DEFAULT 0 AFTER shots;

INSERT INTO schema_migrations (version, description)
VALUES (2, 'Add clutch attempts and extended raw counters');
