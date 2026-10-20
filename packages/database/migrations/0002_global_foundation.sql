CREATE TABLE currencies (
  code CHAR(3) PRIMARY KEY,
  exponent TINYINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  CHECK (exponent <= 6)
) ENGINE=InnoDB;

CREATE TABLE simulation_accounts (
  id CHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  reporting_currency CHAR(3) NOT NULL,
  data_mode ENUM('synthetic') NOT NULL,
  grant_version VARCHAR(64) NOT NULL,
  grant_snapshot JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (reporting_currency) REFERENCES currencies(code)
) ENGINE=InnoDB;

CREATE TABLE wallets (
  account_id CHAR(36) NOT NULL,
  currency CHAR(3) NOT NULL,
  balance_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, currency),
  FOREIGN KEY (account_id) REFERENCES simulation_accounts(id),
  FOREIGN KEY (currency) REFERENCES currencies(code),
  CHECK (balance_minor >= 0)
) ENGINE=InnoDB;

CREATE TABLE cash_journals (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  currency CHAR(3) NOT NULL,
  kind ENUM('opening_grant') NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY one_grant (account_id, kind),
  FOREIGN KEY (account_id) REFERENCES simulation_accounts(id),
  FOREIGN KEY (currency) REFERENCES currencies(code)
) ENGINE=InnoDB;

CREATE TABLE cash_entries (
  journal_id CHAR(36) NOT NULL,
  bucket ENUM('wallet', 'scenario_funding') NOT NULL,
  amount_minor DECIMAL(30,0) NOT NULL,
  PRIMARY KEY (journal_id, bucket),
  FOREIGN KEY (journal_id) REFERENCES cash_journals(id)
) ENGINE=InnoDB;

CREATE TABLE mutation_budgets (
  user_id VARCHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
  window_id BIGINT NOT NULL,
  hits INT UNSIGNED NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id)
) ENGINE=InnoDB;

CREATE TABLE mic_records (
  snapshot_id CHAR(10) NOT NULL,
  mic CHAR(4) NOT NULL,
  operating_mic CHAR(4) NOT NULL,
  kind ENUM('OPRT','SGMT') NOT NULL,
  name VARCHAR(255) NOT NULL,
  country CHAR(2) NOT NULL,
  city VARCHAR(100) NOT NULL,
  category VARCHAR(10) NOT NULL,
  source_status VARCHAR(10) NOT NULL,
  PRIMARY KEY (snapshot_id, mic),
  KEY country_kind (snapshot_id, country, kind)
) ENGINE=InnoDB;

CREATE TABLE securities (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  fictional BOOLEAN NOT NULL
) ENGINE=InnoDB;

CREATE TABLE listings (
  id VARCHAR(64) PRIMARY KEY,
  security_id VARCHAR(64) NOT NULL,
  mic CHAR(4) NOT NULL,
  symbol VARCHAR(32) NOT NULL,
  settlement_currency CHAR(3) NOT NULL,
  quote_unit VARCHAR(8) NOT NULL,
  unit_numerator DECIMAL(20,0) NOT NULL,
  unit_denominator DECIMAL(20,0) NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  fixture_policy JSON NOT NULL,
  UNIQUE KEY venue_symbol (mic, symbol),
  FOREIGN KEY (security_id) REFERENCES securities(id),
  FOREIGN KEY (settlement_currency) REFERENCES currencies(code),
  CHECK (unit_numerator > 0 AND unit_denominator > 0)
) ENGINE=InnoDB;

CREATE TABLE provider_aliases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id VARCHAR(64) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  alias VARCHAR(80) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  UNIQUE KEY dated_alias (provider, alias, effective_from),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
) ENGINE=InnoDB;

CREATE TABLE venue_capabilities (
  mic CHAR(4) NOT NULL,
  capability VARCHAR(40) NOT NULL,
  status ENUM('unknown','blocked','verified') NOT NULL DEFAULT 'unknown',
  reason VARCHAR(255) NOT NULL,
  evidence_ref VARCHAR(255) NOT NULL,
  checked_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (mic, capability)
) ENGINE=InnoDB;
