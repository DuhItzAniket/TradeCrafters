-- Dedicated research schema only; never apply to the application database.
CREATE TABLE research_store_version (
  singleton TINYINT PRIMARY KEY CHECK (singleton=1),
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
) ENGINE=InnoDB;

CREATE TABLE research_accounts (
  account_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  policy JSON NOT NULL,
  generation BIGINT UNSIGNED NOT NULL DEFAULT 1,
  blocked BOOLEAN NOT NULL DEFAULT false,
  minute_window BIGINT UNSIGNED NOT NULL DEFAULT 0,
  minute_used INT UNSIGNED NOT NULL DEFAULT 0,
  day_window BIGINT UNSIGNED NOT NULL DEFAULT 0,
  day_used INT UNSIGNED NOT NULL DEFAULT 0,
  cooldown_until BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE research_feeds (
  account_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dataset VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  policy JSON NOT NULL,
  generation BIGINT UNSIGNED NOT NULL DEFAULT 1,
  minute_window BIGINT UNSIGNED NOT NULL DEFAULT 0,
  minute_used INT UNSIGNED NOT NULL DEFAULT 0,
  day_window BIGINT UNSIGNED NOT NULL DEFAULT 0,
  day_used INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY(account_id,dataset),
  FOREIGN KEY(account_id) REFERENCES research_accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE research_leases (
  account_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dataset VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  account_generation BIGINT UNSIGNED NOT NULL,
  feed_generation BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY(account_id,dataset,request_hash),
  KEY active_leases(account_id,expires_at),
  FOREIGN KEY(account_id,dataset) REFERENCES research_feeds(account_id,dataset) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE research_cache (
  account_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dataset VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  bytes INT UNSIGNED NOT NULL CHECK(bytes<=262144),
  stored_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  last_read BIGINT UNSIGNED NOT NULL,
  CHECK(bytes=OCTET_LENGTH(payload)),
  PRIMARY KEY(account_id,dataset,request_hash),
  KEY cache_expiry(expires_at,account_id),
  KEY cache_lru(account_id,last_read),
  FOREIGN KEY(account_id,dataset) REFERENCES research_feeds(account_id,dataset) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE EVENT research_cache_expiry
  ON SCHEDULE EVERY 10 SECOND
  ON COMPLETION PRESERVE
  ENABLE
  DO DELETE FROM research_cache
    WHERE expires_at<=FLOOR(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
    LIMIT 512;
