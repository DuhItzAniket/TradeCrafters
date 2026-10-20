ALTER TABLE provider_aliases
  MODIFY provider VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  MODIFY alias VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  ADD INDEX listing_provider_window (listing_id, provider, effective_from, effective_to);

-- The namespace row exists before overlapping assignment checks, even for a new alias.
CREATE TABLE provider_alias_namespaces (
  provider VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
  alias VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (provider, alias)
) ENGINE=InnoDB;

CREATE TABLE catalog_audit (
  id CHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
  action VARCHAR(40) NOT NULL,
  subject VARCHAR(180) COLLATE utf8mb4_bin NOT NULL,
  actor VARCHAR(96) COLLATE utf8mb4_bin NOT NULL,
  reason VARCHAR(300) NOT NULL,
  detail JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX subject_history (subject, created_at)
) ENGINE=InnoDB;
