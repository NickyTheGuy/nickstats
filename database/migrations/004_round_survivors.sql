USE nickstats;

ALTER TABLE match_rounds
  ADD COLUMN t_alive_end TINYINT UNSIGNED NULL AFTER bomb_plant_elapsed_ms,
  ADD COLUMN ct_alive_end TINYINT UNSIGNED NULL AFTER t_alive_end,
  ADD CONSTRAINT chk_match_rounds_survivors CHECK (
    (t_alive_end IS NULL AND ct_alive_end IS NULL) OR
    (t_alive_end IS NOT NULL AND ct_alive_end IS NOT NULL AND
     t_alive_end <= 16 AND ct_alive_end <= 16)
  );

INSERT INTO schema_migrations (version, description)
VALUES (4, 'Round-end survivor counts')
ON DUPLICATE KEY UPDATE description = 'Round-end survivor counts';
