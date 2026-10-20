CREATE TABLE catalog_import_guard (id TINYINT PRIMARY KEY) ENGINE=InnoDB;
INSERT INTO catalog_import_guard (id) VALUES (1);

CREATE TABLE catalog_snapshots (
  snapshot_id CHAR(10) PRIMARY KEY,
  source_kind ENUM('iso10383','test') NOT NULL,
  effective_from DATE NOT NULL,
  retrieved_on DATE NOT NULL,
  source_url VARCHAR(255) NOT NULL,
  content_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  parent_snapshot CHAR(10),
  record_count INT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (parent_snapshot) REFERENCES catalog_snapshots(snapshot_id),
  CHECK (effective_from >= snapshot_id),
  CHECK (record_count > 0)
) ENGINE=InnoDB;

CREATE TABLE mic_record_versions (
  snapshot_id CHAR(10) NOT NULL,
  mic CHAR(4) NOT NULL,
  definition JSON NOT NULL,
  content_hash CHAR(64) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (snapshot_id,mic),
  FOREIGN KEY (snapshot_id) REFERENCES catalog_snapshots(snapshot_id),
  FOREIGN KEY (snapshot_id,mic) REFERENCES mic_records(snapshot_id,mic)
) ENGINE=InnoDB;

CREATE TABLE catalog_snapshot_changes (
  snapshot_id CHAR(10) NOT NULL,
  mic CHAR(4) NOT NULL,
  change_kind ENUM('added','removed','changed') NOT NULL,
  PRIMARY KEY (snapshot_id,mic),
  FOREIGN KEY (snapshot_id) REFERENCES catalog_snapshots(snapshot_id)
) ENGINE=InnoDB;

CREATE TABLE venue_classifications (
  snapshot_id CHAR(10) NOT NULL,
  mic CHAR(4) NOT NULL,
  classification ENUM('cash_equity','other_facility','unknown') NOT NULL,
  evidence_ref VARCHAR(255) NOT NULL,
  reviewed_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (snapshot_id,mic),
  FOREIGN KEY (snapshot_id,mic) REFERENCES mic_record_versions(snapshot_id,mic),
  CHECK (expires_at > reviewed_at)
) ENGINE=InnoDB;

CREATE TABLE market_capability_versions (
  id CHAR(64) COLLATE utf8mb4_bin PRIMARY KEY,
  snapshot_id CHAR(10) NOT NULL,
  mic CHAR(4) NOT NULL,
  provider VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  dataset VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  capability VARCHAR(40) NOT NULL,
  definition JSON NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NOT NULL,
  FOREIGN KEY (snapshot_id,mic) REFERENCES mic_record_versions(snapshot_id,mic),
  INDEX capability_window (snapshot_id,mic,provider,dataset,capability,effective_from,effective_to),
  CHECK (effective_to > effective_from)
) ENGINE=InnoDB;
