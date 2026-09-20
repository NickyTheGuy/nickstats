START TRANSACTION;

ALTER TABLE player_side_stats
  ADD COLUMN opening_own_flash_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_enemy_flash_assisted_deaths,
  ADD COLUMN opening_victim_side_flash_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_own_flash_kills,
  ADD COLUMN opening_blind_source_unknown_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_victim_side_flash_kills,
  ADD COLUMN opening_deaths_to_killer_flash SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_blind_source_unknown_kills,
  ADD COLUMN opening_deaths_to_own_side_flash SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_deaths_to_killer_flash,
  ADD COLUMN opening_deaths_blind_source_unknown SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_deaths_to_own_side_flash,
  ADD CONSTRAINT chk_player_side_stats_opening_flash_sources CHECK (
    opening_own_flash_kills <= opening_blinded_enemy_kills AND
    opening_victim_side_flash_kills <= opening_blinded_enemy_kills AND
    opening_blind_source_unknown_kills <= opening_blinded_enemy_kills AND
    opening_deaths_to_killer_flash <= opening_deaths_while_blind AND
    opening_deaths_to_own_side_flash <= opening_deaths_while_blind AND
    opening_deaths_blind_source_unknown <= opening_deaths_while_blind
  );

INSERT INTO schema_migrations (version, description)
VALUES (12, 'Opening flash source attribution')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
