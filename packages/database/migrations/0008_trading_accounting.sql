ALTER TABLE simulation_accounts
  ADD COLUMN state ENUM('active','archived') NOT NULL DEFAULT 'active',
  ADD COLUMN version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN scenario_id VARCHAR(64) NOT NULL DEFAULT 'regional-training-2026-10-20-v1',
  ADD COLUMN model_version VARCHAR(64) NOT NULL DEFAULT 'reference-spread-v1',
  ADD COLUMN active_owner VARCHAR(36) COLLATE utf8mb4_bin GENERATED ALWAYS AS (IF(state='active',user_id,NULL)) STORED,
  ADD UNIQUE KEY one_active_owner (active_owner),
  ADD KEY owner_history (user_id,created_at),
  DROP INDEX user_id;

ALTER TABLE cash_journals
  MODIFY kind ENUM('opening_grant','trade','fx') NOT NULL,
  ADD COLUMN opening_account CHAR(36) GENERATED ALWAYS AS (IF(kind='opening_grant',account_id,NULL)) STORED,
  ADD UNIQUE KEY one_opening_grant (opening_account),
  ADD KEY account_journals (account_id,created_at,id),
  DROP INDEX one_grant;

ALTER TABLE cash_entries MODIFY bucket ENUM('wallet','scenario_funding','clearing','fx_clearing') NOT NULL;

CREATE TABLE market_snapshots (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  listing_id VARCHAR(64) NOT NULL,
  definition JSON NOT NULL,
  content_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  FOREIGN KEY (account_id) REFERENCES simulation_accounts(id),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  KEY account_quotes (account_id,observed_at),
  CHECK (expires_at > observed_at)
) ENGINE=InnoDB;

CREATE TABLE fx_quotes (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  definition JSON NOT NULL,
  content_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  FOREIGN KEY (account_id) REFERENCES simulation_accounts(id),
  KEY account_quotes (account_id,observed_at),
  CHECK (expires_at > observed_at)
) ENGINE=InnoDB;

CREATE TABLE operation_records (
  account_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(96) COLLATE utf8mb4_bin NOT NULL,
  id CHAR(36) NOT NULL UNIQUE,
  request_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  kind ENUM('order','fx','reset') NOT NULL,
  receipt JSON NOT NULL,
  http_status SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id,idempotency_key),
  KEY activity_cursor (account_id,created_at,id),
  FOREIGN KEY (account_id) REFERENCES simulation_accounts(id)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  listing_id VARCHAR(64) NOT NULL,
  side ENUM('BUY','SELL') NOT NULL,
  quantity BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (account_id) REFERENCES simulation_accounts(id),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE fills (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL UNIQUE,
  snapshot_id CHAR(36) NOT NULL,
  journal_id CHAR(36) NOT NULL UNIQUE,
  definition JSON NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (snapshot_id) REFERENCES market_snapshots(id),
  FOREIGN KEY (journal_id) REFERENCES cash_journals(id)
) ENGINE=InnoDB;

CREATE TABLE positions (
  account_id CHAR(36) NOT NULL,
  listing_id VARCHAR(64) NOT NULL,
  currency CHAR(3) NOT NULL,
  quantity BIGINT UNSIGNED NOT NULL DEFAULT 0,
  cost_basis_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
  realized_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id,listing_id),
  FOREIGN KEY (account_id,currency) REFERENCES wallets(account_id,currency),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  CHECK (cost_basis_minor >= 0),
  CHECK (quantity > 0 OR cost_basis_minor=0)
) ENGINE=InnoDB;

CREATE TABLE fx_conversions (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  quote_id CHAR(36) NOT NULL,
  source_journal_id CHAR(36) NOT NULL UNIQUE,
  target_journal_id CHAR(36) NOT NULL UNIQUE,
  definition JSON NOT NULL,
  FOREIGN KEY (account_id) REFERENCES simulation_accounts(id),
  FOREIGN KEY (quote_id) REFERENCES fx_quotes(id),
  FOREIGN KEY (source_journal_id) REFERENCES cash_journals(id),
  FOREIGN KEY (target_journal_id) REFERENCES cash_journals(id)
) ENGINE=InnoDB;

CREATE TABLE account_resets (
  old_account_id CHAR(36) PRIMARY KEY,
  next_account_id CHAR(36) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (old_account_id) REFERENCES simulation_accounts(id),
  FOREIGN KEY (next_account_id) REFERENCES simulation_accounts(id)
) ENGINE=InnoDB;
