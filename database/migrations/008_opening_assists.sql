START TRANSACTION;

ALTER TABLE player_side_stats
  ADD COLUMN opening_assisted_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_deaths,
  ADD COLUMN opening_damage_assisted_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_assisted_kills,
  ADD COLUMN opening_flash_assisted_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_damage_assisted_kills,
  ADD CONSTRAINT chk_player_side_stats_opening_assists CHECK (
    opening_assisted_kills <= opening_kills AND
    opening_damage_assisted_kills <= opening_assisted_kills AND
    opening_flash_assisted_kills <= opening_assisted_kills
  );

INSERT INTO schema_migrations (version, description)
VALUES (8, 'Unique assisted opening kills with damage and flash attribution')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
