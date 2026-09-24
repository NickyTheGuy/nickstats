CREATE TABLE player_round_phase_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  match_player_id BIGINT UNSIGNED NOT NULL,
  round_number SMALLINT UNSIGNED NOT NULL,
  side ENUM('T', 'CT') NOT NULL,
  buy_type ENUM('pistol', 'eco', 'force', 'full') NULL,
  opponent_buy_type ENUM('pistol', 'eco', 'force', 'full') NULL,
  round_result ENUM('win', 'loss') NULL,
  stats_json JSON NOT NULL,
  PRIMARY KEY (match_player_id, round_number),
  KEY idx_player_round_phase_match (match_id),
  CONSTRAINT fk_player_round_phase_player
    FOREIGN KEY (match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (17, 'Player statistics per played round for regulation and overtime')
ON DUPLICATE KEY UPDATE description = VALUES(description);
