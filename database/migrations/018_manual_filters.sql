-- Private account labels. Defaults are derived from a creation-time match ID cutoff;
-- only explicit assignments need storage, including an explicit Unknown override.
CREATE TABLE IF NOT EXISTS account_manual_filters (
  id CHAR(36) NOT NULL,
  username VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  cutoff_match_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_manual_filter_name (username, name),
  CONSTRAINT fk_manual_filter_account FOREIGN KEY (username) REFERENCES auth_users (username)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS account_manual_filter_states (
  filter_id CHAR(36) NOT NULL,
  match_id BIGINT UNSIGNED NOT NULL,
  state VARCHAR(7) NOT NULL,
  PRIMARY KEY (filter_id, match_id),
  KEY idx_manual_filter_match (match_id),
  CONSTRAINT fk_manual_state_filter FOREIGN KEY (filter_id) REFERENCES account_manual_filters (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_manual_state_match FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_manual_filter_state CHECK (state IN ('true', 'false', 'unknown'))
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (18, 'Private account manual filters and match states')
ON DUPLICATE KEY UPDATE description = VALUES(description);
