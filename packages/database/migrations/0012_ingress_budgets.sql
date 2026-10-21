CREATE TABLE ingress_budget_control (
  scope ENUM('read','auth','write') PRIMARY KEY,
  window_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  hits INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO ingress_budget_control (scope) VALUES ('read'),('auth'),('write');

CREATE TABLE ingress_budget_clients (
  scope ENUM('read','auth','write') NOT NULL,
  window_id BIGINT UNSIGNED NOT NULL,
  subject_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hits INT UNSIGNED NOT NULL,
  PRIMARY KEY (scope,window_id,subject_digest),
  INDEX ingress_expiry (window_id),
  FOREIGN KEY (scope) REFERENCES ingress_budget_control(scope),
  CHECK (hits > 0)
) ENGINE=InnoDB;
