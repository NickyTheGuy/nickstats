START TRANSACTION;

ALTER TABLE player_side_stats
  ADD COLUMN opening_blinded_enemy_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_flash_assists,
  ADD COLUMN opening_blind_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_blinded_enemy_kills,
  ADD COLUMN opening_deaths_while_blind SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_blind_kills,
  ADD COLUMN opening_deaths_to_blind_killer SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_deaths_while_blind,
  ADD COLUMN opening_enemy_assisted_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_deaths_to_blind_killer,
  ADD COLUMN opening_enemy_damage_assisted_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_enemy_assisted_deaths,
  ADD COLUMN opening_enemy_flash_assisted_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_enemy_damage_assisted_deaths,
  ADD CONSTRAINT chk_player_side_stats_opening_context CHECK (
    opening_blinded_enemy_kills <= opening_kills AND
    opening_blind_kills <= opening_kills AND
    opening_deaths_while_blind <= opening_deaths AND
    opening_deaths_to_blind_killer <= opening_deaths AND
    opening_enemy_assisted_deaths <= opening_deaths AND
    opening_enemy_damage_assisted_deaths <= opening_enemy_assisted_deaths AND
    opening_enemy_flash_assisted_deaths <= opening_enemy_assisted_deaths
  );

INSERT INTO schema_migrations (version, description)
VALUES (10, 'Opening kill and death context')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
