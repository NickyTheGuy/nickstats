-- NickStats database schema
-- Target: MySQL 8.0+

CREATE DATABASE IF NOT EXISTS nickstats
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE nickstats;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS parser_configs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  config_sha256 BINARY(32) NOT NULL,
  rules_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parser_configs_hash (config_sha256)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS matches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(32) NULL,
  provider_match_id VARCHAR(128) NULL,
  demo_sha256 BINARY(32) NOT NULL,
  payload_schema VARCHAR(64) NOT NULL,
  nickstats_build VARCHAR(32) NOT NULL,
  parser_name VARCHAR(64) NOT NULL,
  parser_version VARCHAR(32) NOT NULL,
  parser_config_id BIGINT UNSIGNED NOT NULL,
  map_name VARCHAR(64) NOT NULL,
  played_at DATETIME NULL,
  played_at_source VARCHAR(32) NULL,
  rounds SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_matches_demo_sha256 (demo_sha256),
  UNIQUE KEY uq_matches_provider_id (provider, provider_match_id),
  KEY idx_matches_played_at (played_at DESC, id),
  KEY idx_matches_map_time (map_name, played_at DESC),
  CONSTRAINT fk_matches_parser_config
    FOREIGN KEY (parser_config_id) REFERENCES parser_configs (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_matches_rounds CHECK (rounds > 0),
  CONSTRAINT chk_matches_provider_pair CHECK (
    (provider IS NULL AND provider_match_id IS NULL) OR
    (provider IS NOT NULL AND provider_match_id IS NOT NULL)
  )
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS players (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  steam_id BIGINT UNSIGNED NOT NULL,
  current_name VARCHAR(128) NOT NULL,
  first_seen_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_players_steam_id (steam_id),
  KEY idx_players_current_name (current_name)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS match_teams (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id BIGINT UNSIGNED NOT NULL,
  team_slot TINYINT UNSIGNED NOT NULL,
  source_team_id VARCHAR(32) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  score SMALLINT UNSIGNED NULL,
  t_round_wins SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ct_round_wins SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_teams_slot (match_id, team_slot),
  UNIQUE KEY uq_match_teams_source (match_id, source_team_id),
  UNIQUE KEY uq_match_teams_id_match (id, match_id),
  CONSTRAINT fk_match_teams_match
    FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_match_teams_slot CHECK (team_slot < 2)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS match_players (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id BIGINT UNSIGNED NOT NULL,
  match_team_id BIGINT UNSIGNED NOT NULL,
  player_slot TINYINT UNSIGNED NOT NULL,
  player_id BIGINT UNSIGNED NULL,
  display_name VARCHAR(128) NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_players_slot (match_id, player_slot),
  UNIQUE KEY uq_match_players_human (match_id, player_id),
  UNIQUE KEY uq_match_players_id_match (id, match_id),
  KEY idx_match_players_player_matches (player_id, match_id),
  KEY idx_match_players_team (match_id, match_team_id, player_id),
  CONSTRAINT fk_match_players_match
    FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_match_players_team
    FOREIGN KEY (match_team_id, match_id) REFERENCES match_teams (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_match_players_player
    FOREIGN KEY (player_id) REFERENCES players (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_match_players_identity CHECK (
    (is_bot = FALSE AND player_id IS NOT NULL) OR
    (is_bot = TRUE AND player_id IS NULL)
  )
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS player_side_stats (
  match_player_id BIGINT UNSIGNED NOT NULL,
  side ENUM('T', 'CT') NOT NULL,
  rounds_played SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  rounds_won SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  assists SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  headshots SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  damage INT UNSIGNED NOT NULL DEFAULT 0,
  kast_rounds SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  opening_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  opening_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  trade_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tradeable_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  attempted_tradeable_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  traded_deaths SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  he_damage INT UNSIGNED NOT NULL DEFAULT 0,
  fire_damage INT UNSIGNED NOT NULL DEFAULT 0,
  kill_speed_total DECIMAL(12, 3) NOT NULL DEFAULT 0,
  kill_speed_samples SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kill_speed_max DECIMAL(9, 3) NULL,
  kill_speed_percent_total DECIMAL(12, 3) NOT NULL DEFAULT 0,
  kill_speed_percent_samples SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kill_speed_percent_max DECIMAL(9, 3) NULL,
  death_speed_total DECIMAL(12, 3) NOT NULL DEFAULT 0,
  death_speed_samples SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  death_speed_max DECIMAL(9, 3) NULL,
  death_speed_percent_total DECIMAL(12, 3) NOT NULL DEFAULT 0,
  death_speed_percent_samples SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  death_speed_percent_max DECIMAL(9, 3) NULL,
  clutch_1v1 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  clutch_1v2 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  clutch_1v3 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  clutch_1v4 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  clutch_1v5 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kill_rounds_1k SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kill_rounds_2k SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kill_rounds_3k SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kill_rounds_4k SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kill_rounds_5k SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (match_player_id, side),
  CONSTRAINT fk_player_side_stats_player
    FOREIGN KEY (match_player_id) REFERENCES match_players (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT chk_player_side_stats_rounds CHECK (rounds_won <= rounds_played),
  CONSTRAINT chk_player_side_stats_kast CHECK (kast_rounds <= rounds_played),
  CONSTRAINT chk_player_side_stats_trade_deaths CHECK (
    traded_deaths <= attempted_tradeable_deaths AND
    attempted_tradeable_deaths <= tradeable_deaths
  )
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS weapon_side_stats (
  match_player_id BIGINT UNSIGNED NOT NULL,
  side ENUM('T', 'CT') NOT NULL,
  weapon VARCHAR(64) NOT NULL,
  kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  shots INT UNSIGNED NOT NULL DEFAULT 0,
  damage INT UNSIGNED NOT NULL DEFAULT 0,
  rounds_used SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (match_player_id, side, weapon),
  KEY idx_weapon_side_stats_weapon (weapon, match_player_id),
  CONSTRAINT fk_weapon_side_stats_player
    FOREIGN KEY (match_player_id) REFERENCES match_players (id)
    ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS duel_side_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  killer_match_player_id BIGINT UNSIGNED NOT NULL,
  victim_match_player_id BIGINT UNSIGNED NOT NULL,
  killer_side ENUM('T', 'CT') NOT NULL,
  kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (killer_match_player_id, victim_match_player_id, killer_side),
  KEY idx_duel_side_stats_match (match_id),
  KEY idx_duel_side_stats_victim (victim_match_player_id, killer_side),
  CONSTRAINT fk_duel_side_stats_match
    FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_duel_side_stats_killer
    FOREIGN KEY (killer_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_duel_side_stats_victim
    FOREIGN KEY (victim_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_duel_side_stats_kills CHECK (kills > 0)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS trade_side_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  trader_match_player_id BIGINT UNSIGNED NOT NULL,
  teammate_match_player_id BIGINT UNSIGNED NOT NULL,
  trader_side ENUM('T', 'CT') NOT NULL,
  opportunities SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  successes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (trader_match_player_id, teammate_match_player_id, trader_side),
  KEY idx_trade_side_stats_match (match_id),
  KEY idx_trade_side_stats_teammate (teammate_match_player_id, trader_side),
  CONSTRAINT fk_trade_side_stats_match
    FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_trade_side_stats_trader
    FOREIGN KEY (trader_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_trade_side_stats_teammate
    FOREIGN KEY (teammate_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_trade_side_stats_people CHECK (trader_match_player_id <> teammate_match_player_id),
  CONSTRAINT chk_trade_side_stats_counts CHECK (
    successes <= attempts AND attempts <= opportunities
  )
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS kill_context_side_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  killer_match_player_id BIGINT UNSIGNED NOT NULL,
  victim_match_player_id BIGINT UNSIGNED NOT NULL,
  killer_side ENUM('T', 'CT') NOT NULL,
  victim_blinded_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  attacker_blind_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  wallbang_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  penetration_total SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  smoke_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  airborne_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  moving_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  still_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  running_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  victim_grenade_out_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  victim_knife_out_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  equipment_disadvantage_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  unfair_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (killer_match_player_id, victim_match_player_id, killer_side),
  KEY idx_kill_context_side_stats_match (match_id),
  KEY idx_kill_context_side_stats_victim (victim_match_player_id, killer_side),
  CONSTRAINT fk_kill_context_side_stats_match
    FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_kill_context_side_stats_killer
    FOREIGN KEY (killer_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_kill_context_side_stats_victim
    FOREIGN KEY (victim_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS assisted_kill_side_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  beneficiary_match_player_id BIGINT UNSIGNED NOT NULL,
  assister_match_player_id BIGINT UNSIGNED NOT NULL,
  beneficiary_side ENUM('T', 'CT') NOT NULL,
  damage_assisted_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  teammate_flash_assisted_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  own_flash_kills SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (beneficiary_match_player_id, assister_match_player_id, beneficiary_side),
  KEY idx_assisted_kill_side_stats_match (match_id),
  KEY idx_assisted_kill_side_stats_assister (assister_match_player_id, beneficiary_side),
  CONSTRAINT fk_assisted_kill_side_stats_match
    FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_assisted_kill_side_stats_beneficiary
    FOREIGN KEY (beneficiary_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assisted_kill_side_stats_assister
    FOREIGN KEY (assister_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS flash_side_stats (
  match_id BIGINT UNSIGNED NOT NULL,
  thrower_match_player_id BIGINT UNSIGNED NOT NULL,
  victim_match_player_id BIGINT UNSIGNED NOT NULL,
  thrower_side ENUM('T', 'CT') NOT NULL,
  flash_effects SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  blind_duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (thrower_match_player_id, victim_match_player_id, thrower_side),
  KEY idx_flash_side_stats_match (match_id),
  KEY idx_flash_side_stats_victim (victim_match_player_id, thrower_side),
  CONSTRAINT fk_flash_side_stats_match
    FOREIGN KEY (match_id) REFERENCES matches (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_flash_side_stats_thrower
    FOREIGN KEY (thrower_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_flash_side_stats_victim
    FOREIGN KEY (victim_match_player_id, match_id) REFERENCES match_players (id, match_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_flash_side_stats_values CHECK (flash_effects > 0 OR blind_duration_ms > 0)
) ENGINE = InnoDB;

INSERT INTO schema_migrations (version, description)
VALUES (1, 'Initial normalized NickStats match schema')
ON DUPLICATE KEY UPDATE description = 'Initial normalized NickStats match schema';
