USE nickstats;

-- One compact, capture-owned record per HE/flash/fire detonation. Unknown is NULL.
CREATE TABLE IF NOT EXISTS replay_utility_events (
  capture_id CHAR(36) NOT NULL,
  round_number SMALLINT UNSIGNED NOT NULL,
  event_number INT UNSIGNED NOT NULL,
  player_id VARCHAR(200) NULL,
  side TINYINT UNSIGNED NOT NULL,
  grenade_type ENUM('HE','Flash','Fire') NOT NULL,
  icon VARCHAR(32) NOT NULL,
  elapsed_ms INT UNSIGNED NOT NULL,
  x INT NOT NULL, y INT NOT NULL, z INT NOT NULL,
  enemy_damage INT UNSIGNED NULL,
  enemies_flashed INT UNSIGNED NULL,
  enemy_blind_ms INT UNSIGNED NULL,
  attribution ENUM('capture','single_throw','unknown') NOT NULL,
  PRIMARY KEY (capture_id, round_number, event_number),
  KEY idx_utility_damage (capture_id, grenade_type, enemy_damage),
  KEY idx_utility_flash (capture_id, grenade_type, enemies_flashed),
  CONSTRAINT fk_utility_capture FOREIGN KEY (capture_id) REFERENCES replay_captures(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS replay_utility_index_state (
  capture_id CHAR(36) NOT NULL,
  version TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (capture_id),
  CONSTRAINT fk_utility_index_capture FOREIGN KEY (capture_id) REFERENCES replay_captures(id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT IGNORE INTO schema_migrations(version,description) VALUES(22,'Per-grenade analyzer effectiveness search');
