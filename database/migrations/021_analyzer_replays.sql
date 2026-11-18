USE nickstats;

-- Movement captures are independent of statistics, tags and extension dates.
CREATE TABLE IF NOT EXISTS replay_captures (
  id CHAR(36) NOT NULL,
  match_id BIGINT UNSIGNED NOT NULL,
  demo_sha256 BINARY(32) NOT NULL,
  header_json MEDIUMTEXT NOT NULL,
  manifest_json MEDIUMTEXT NOT NULL,
  complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_replay_match (match_id, complete, created_at),
  CONSTRAINT fk_replay_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE TABLE IF NOT EXISTS replay_chunks (
  capture_id CHAR(36) NOT NULL,
  round_number SMALLINT UNSIGNED NOT NULL,
  part_number SMALLINT UNSIGNED NOT NULL,
  body MEDIUMTEXT NOT NULL,
  PRIMARY KEY (capture_id, round_number, part_number),
  CONSTRAINT fk_replay_capture FOREIGN KEY (capture_id) REFERENCES replay_captures (id) ON DELETE CASCADE
) ENGINE = InnoDB;

INSERT IGNORE INTO schema_migrations (version, description) VALUES (21, 'Independent analyzer movement captures');
