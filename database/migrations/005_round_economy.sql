USE nickstats;

ALTER TABLE match_rounds
  ADD COLUMN t_equipment_value MEDIUMINT UNSIGNED NULL AFTER ct_alive_end,
  ADD COLUMN ct_equipment_value MEDIUMINT UNSIGNED NULL AFTER t_equipment_value,
  ADD COLUMN t_player_count TINYINT UNSIGNED NULL AFTER ct_equipment_value,
  ADD COLUMN ct_player_count TINYINT UNSIGNED NULL AFTER t_player_count,
  ADD COLUMN pistol_round BOOLEAN NULL AFTER ct_player_count,
  ADD COLUMN t_match_team_id BIGINT UNSIGNED NULL AFTER pistol_round,
  ADD COLUMN ct_match_team_id BIGINT UNSIGNED NULL AFTER t_match_team_id,
  ADD KEY idx_match_rounds_t_team (t_match_team_id, match_id),
  ADD KEY idx_match_rounds_ct_team (ct_match_team_id, match_id),
  ADD CONSTRAINT fk_match_rounds_t_team
    FOREIGN KEY (t_match_team_id, match_id) REFERENCES match_teams (id, match_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_match_rounds_ct_team
    FOREIGN KEY (ct_match_team_id, match_id) REFERENCES match_teams (id, match_id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT chk_match_rounds_economy CHECK (
    (t_equipment_value IS NULL AND ct_equipment_value IS NULL AND
     t_player_count IS NULL AND ct_player_count IS NULL AND pistol_round IS NULL AND
     t_match_team_id IS NULL AND ct_match_team_id IS NULL) OR
    (t_equipment_value IS NOT NULL AND ct_equipment_value IS NOT NULL AND
     t_player_count BETWEEN 1 AND 16 AND ct_player_count BETWEEN 1 AND 16 AND
     pistol_round IS NOT NULL AND t_match_team_id IS NOT NULL AND
     ct_match_team_id IS NOT NULL AND t_match_team_id <> ct_match_team_id)
  );

INSERT INTO schema_migrations (version, description)
VALUES (5, 'Round freeze-time economy facts')
ON DUPLICATE KEY UPDATE description = 'Round freeze-time economy facts';
