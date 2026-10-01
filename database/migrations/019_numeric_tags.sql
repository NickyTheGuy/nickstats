-- Existing private True/False labels become boolean tags without changing assignments.
ALTER TABLE account_manual_filters
  ADD COLUMN kind ENUM('boolean', 'number') NOT NULL DEFAULT 'boolean' AFTER name;
ALTER TABLE account_manual_filter_states
  ADD COLUMN numeric_value DOUBLE NULL AFTER state,
  ADD CONSTRAINT chk_manual_tag_value CHECK (numeric_value IS NULL OR state = 'true');
INSERT INTO schema_migrations (version, description)
VALUES (19, 'Numeric private account tags')
ON DUPLICATE KEY UPDATE description = VALUES(description);
