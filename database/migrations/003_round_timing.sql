USE nickstats;

CREATE TABLE IF NOT EXISTS match_rounds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id BIGINT UNSIGNED NOT NULL,
  round_number SMALLINT UNSIGNED NOT NULL,
  live_start_tick BIGINT UNSIGNED NOT NULL,
  end_tick BIGINT UNSIGNED NOT NULL,
  duration_ms INT UNSIGNED NOT NULL,
  winner_side ENUM('T', 'CT') NULL,
  bomb_plant_elapsed_ms INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_rounds_number (match_id, round_number),
  UNIQUE KEY uq_match_rounds_id_match (id, match_id),
  CONSTRAINT fk_match_rounds_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_match_rounds_ticks CHECK (end_tick >= live_start_tick),
  CONSTRAINT chk_match_rounds_plant CHECK (bomb_plant_elapsed_ms IS NULL OR bomb_plant_elapsed_ms <= duration_ms)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS death_events (
  match_id BIGINT UNSIGNED NOT NULL,
  match_round_id BIGINT UNSIGNED NOT NULL,
  event_sequence TINYINT UNSIGNED NOT NULL,
  event_tick BIGINT UNSIGNED NOT NULL,
  elapsed_ms INT UNSIGNED NOT NULL,
  killer_match_player_id BIGINT UNSIGNED NULL,
  victim_match_player_id BIGINT UNSIGNED NOT NULL,
  killer_side ENUM('T', 'CT') NULL,
  victim_side ENUM('T', 'CT') NOT NULL,
  weapon VARCHAR(64) NOT NULL,
  enemy_kill BOOLEAN NOT NULL,
  context_flags SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  t_alive_before TINYINT UNSIGNED NOT NULL,
  ct_alive_before TINYINT UNSIGNED NOT NULL,
  since_plant_ms INT UNSIGNED NULL,
  PRIMARY KEY (match_round_id, event_sequence),
  KEY idx_death_events_match (match_id, elapsed_ms),
  KEY idx_death_events_killer (killer_match_player_id, killer_side, elapsed_ms),
  KEY idx_death_events_victim (victim_match_player_id, victim_side, elapsed_ms),
  CONSTRAINT fk_death_events_round FOREIGN KEY (match_round_id, match_id) REFERENCES match_rounds (id, match_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_death_events_killer FOREIGN KEY (killer_match_player_id, match_id) REFERENCES match_players (id, match_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_death_events_victim FOREIGN KEY (victim_match_player_id, match_id) REFERENCES match_players (id, match_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_death_events_enemy CHECK (
    enemy_kill = FALSE OR (killer_match_player_id IS NOT NULL AND killer_side IS NOT NULL AND killer_side <> victim_side)
  )
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (3, 'Round timing and death event facts')
ON DUPLICATE KEY UPDATE description = 'Round timing and death event facts';
