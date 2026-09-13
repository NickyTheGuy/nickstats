START TRANSACTION;

CREATE TABLE IF NOT EXISTS player_round_result_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  match_player_id BIGINT UNSIGNED NOT NULL,
  side ENUM('T', 'CT') NOT NULL,
  buy_type ENUM('ALL', 'pistol', 'eco', 'force', 'full') NOT NULL,
  round_result ENUM('win', 'loss') NOT NULL,
  stats_json JSON NOT NULL,
  PRIMARY KEY (match_player_id, side, buy_type, round_result),
  KEY idx_player_round_result_stats_match (match_id),
  CONSTRAINT fk_player_round_result_stats_player
    FOREIGN KEY (match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (7, 'Player statistics partitioned by round result')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
