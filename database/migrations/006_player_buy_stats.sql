START TRANSACTION;

CREATE TABLE IF NOT EXISTS player_side_buy_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  match_player_id BIGINT UNSIGNED NOT NULL,
  side ENUM('T', 'CT') NOT NULL,
  buy_type ENUM('pistol', 'eco', 'force', 'full') NOT NULL,
  stats_json JSON NOT NULL,
  PRIMARY KEY (match_player_id, side, buy_type),
  KEY idx_player_side_buy_stats_match (match_id),
  CONSTRAINT fk_player_side_buy_stats_player
    FOREIGN KEY (match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (6, 'Player statistics partitioned by own-team buy state')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
