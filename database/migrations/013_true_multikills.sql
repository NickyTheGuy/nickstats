START TRANSACTION;

ALTER TABLE player_side_stats
  ADD COLUMN true_kill_rounds_1k SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER kill_rounds_5k,
  ADD COLUMN true_kill_rounds_2k SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER true_kill_rounds_1k,
  ADD COLUMN true_kill_rounds_3k SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER true_kill_rounds_2k,
  ADD COLUMN true_kill_rounds_4k SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER true_kill_rounds_3k,
  ADD COLUMN true_kill_rounds_5k SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER true_kill_rounds_4k,
  ADD CONSTRAINT chk_player_side_stats_true_multikills CHECK (
    true_kill_rounds_1k = 0 AND
    true_kill_rounds_2k + true_kill_rounds_3k + true_kill_rounds_4k + true_kill_rounds_5k <=
      kill_rounds_2k + kill_rounds_3k + kill_rounds_4k + kill_rounds_5k
  );

INSERT INTO schema_migrations (version, description)
VALUES (13, 'True multi-kill rounds')
ON DUPLICATE KEY UPDATE description = VALUES(description);

COMMIT;
