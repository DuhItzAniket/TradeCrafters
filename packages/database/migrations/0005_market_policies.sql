CREATE TABLE market_calendar_versions (
  id VARCHAR(96) COLLATE utf8mb4_bin PRIMARY KEY,
  definition JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE trading_rule_versions (
  id VARCHAR(96) COLLATE utf8mb4_bin PRIMARY KEY,
  definition JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE listing_policy_versions (
  id CHAR(64) PRIMARY KEY,
  listing_id VARCHAR(64) NOT NULL,
  calendar_id VARCHAR(96) COLLATE utf8mb4_bin NOT NULL,
  rule_id VARCHAR(96) COLLATE utf8mb4_bin NOT NULL,
  data_mode ENUM('synthetic','real') NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NOT NULL,
  UNIQUE KEY policy_start (listing_id, data_mode, effective_from),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (calendar_id) REFERENCES market_calendar_versions(id),
  FOREIGN KEY (rule_id) REFERENCES trading_rule_versions(id),
  CHECK (effective_to > effective_from)
) ENGINE=InnoDB;

CREATE TABLE listing_policy_permissions (
  policy_id CHAR(64) PRIMARY KEY,
  status ENUM('unknown','blocked','verified') NOT NULL DEFAULT 'unknown',
  display_allowed BOOLEAN NOT NULL DEFAULT false,
  simulation_allowed BOOLEAN NOT NULL DEFAULT false,
  replay_allowed BOOLEAN NOT NULL DEFAULT false,
  verified_at DATETIME(3),
  expires_at DATETIME(3) NOT NULL,
  evidence_ref VARCHAR(255) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  FOREIGN KEY (policy_id) REFERENCES listing_policy_versions(id),
  CHECK (status <> 'verified' OR verified_at IS NOT NULL),
  CHECK (verified_at IS NULL OR expires_at > verified_at)
) ENGINE=InnoDB;

CREATE TABLE listing_halts (
  id VARCHAR(96) COLLATE utf8mb4_bin PRIMARY KEY,
  listing_id VARCHAR(64) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3),
  reason VARCHAR(255) NOT NULL,
  evidence_ref VARCHAR(255) NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  INDEX halt_window (listing_id, starts_at, ends_at),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB;

CREATE TABLE catalog_policy_audit (
  policy_id CHAR(64) PRIMARY KEY,
  reason VARCHAR(300) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (policy_id) REFERENCES listing_policy_versions(id)
) ENGINE=InnoDB;
