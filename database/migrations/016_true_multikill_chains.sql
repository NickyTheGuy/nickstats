-- Old schema-20 rows counted at most one true chain per round. Keep their
-- historical round rate until the demos are reparsed as schema 21.
ALTER TABLE player_side_stats
  DROP CHECK chk_player_side_stats_true_multikills,
  ADD COLUMN true_multikill_rounds SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER true_kill_rounds_5k;

UPDATE player_side_stats
SET true_multikill_rounds = true_kill_rounds_2k + true_kill_rounds_3k +
  true_kill_rounds_4k + true_kill_rounds_5k;

ALTER TABLE player_side_stats
  ADD CONSTRAINT chk_player_side_stats_true_multikills CHECK (
    true_kill_rounds_1k = 0 AND
    true_multikill_rounds <= rounds_played AND
    true_multikill_rounds <= true_kill_rounds_2k + true_kill_rounds_3k +
      true_kill_rounds_4k + true_kill_rounds_5k
  );

INSERT INTO schema_migrations (version, description)
VALUES (16, 'Count separate true multi-kill chains')
ON DUPLICATE KEY UPDATE description = VALUES(description);
