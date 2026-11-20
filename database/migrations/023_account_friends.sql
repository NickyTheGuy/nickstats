USE nickstats;
CREATE TABLE IF NOT EXISTS account_friends (
  account_id BIGINT UNSIGNED NOT NULL,
  player_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (account_id,player_id),
  CONSTRAINT fk_account_friends_account FOREIGN KEY (account_id) REFERENCES auth_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_account_friends_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT IGNORE INTO schema_migrations(version,description) VALUES(23,'Private account friends');
