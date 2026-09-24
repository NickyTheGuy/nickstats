START TRANSACTION;

ALTER TABLE auth_users
  ADD COLUMN representative_player_id BIGINT UNSIGNED NULL AFTER username,
  ADD KEY idx_auth_users_representative_player (representative_player_id),
  ADD CONSTRAINT fk_auth_users_representative_player
    FOREIGN KEY (representative_player_id) REFERENCES players (id)
    ON DELETE SET NULL ON UPDATE RESTRICT;

INSERT INTO schema_migrations (version, description)
VALUES (15, 'Account representative player')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
