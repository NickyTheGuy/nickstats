START TRANSACTION;

ALTER TABLE player_side_stats
  ADD COLUMN opening_traded_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_flash_assisted_kills,
  ADD COLUMN opening_trade_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_traded_deaths,
  ADD COLUMN opening_assists SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_trade_kills,
  ADD COLUMN opening_damage_assists SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_assists,
  ADD COLUMN opening_flash_assists SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_damage_assists,
  ADD CONSTRAINT chk_player_side_stats_opening_attribution CHECK (
    opening_traded_deaths <= opening_deaths AND
    opening_trade_kills <= trade_kills AND
    opening_damage_assists <= opening_assists AND
    opening_flash_assists <= opening_assists
  );

ALTER TABLE trade_side_stats
  ADD COLUMN opening_successes SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER successes,
  DROP CHECK chk_trade_side_stats_counts,
  ADD CONSTRAINT chk_trade_side_stats_counts CHECK (
    successes <= attempts AND attempts <= opportunities AND opening_successes <= successes
  );

ALTER TABLE assisted_kill_side_stats
  ADD COLUMN opening_assists SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER own_flash_kills,
  ADD COLUMN opening_damage_assists SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_assists,
  ADD COLUMN opening_flash_assists SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER opening_damage_assists,
  ADD CONSTRAINT chk_assisted_kill_side_stats_opening CHECK (
    opening_damage_assists <= opening_assists AND opening_flash_assists <= opening_assists
  );

INSERT INTO schema_migrations (version, description)
VALUES (9, 'Opening-death trades and opening-assist attribution')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
