-- Owner-managed read-only grants. Sharing never copies public match data.
CREATE TABLE IF NOT EXISTS account_manual_filter_shares (
  filter_id CHAR(36) NOT NULL,
  username VARCHAR(64) NOT NULL,
  PRIMARY KEY (filter_id, username),
  KEY idx_manual_tag_recipient (username),
  CONSTRAINT fk_manual_tag_share_filter FOREIGN KEY (filter_id) REFERENCES account_manual_filters (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_manual_tag_share_account FOREIGN KEY (username) REFERENCES auth_users (username)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (20, 'Read-only shared private tags')
ON DUPLICATE KEY UPDATE description = VALUES(description);
