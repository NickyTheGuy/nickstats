START TRANSACTION;

CREATE TABLE IF NOT EXISTS auth_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_salt VARBINARY(32) NOT NULL,
  password_hash BINARY(32) NOT NULL,
  password_iterations INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_users_username (username)
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (14, 'Password-backed login accounts')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
