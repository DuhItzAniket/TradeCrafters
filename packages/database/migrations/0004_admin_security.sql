CREATE TABLE admin_roles (
  user_id VARCHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE mfa_stepups (
  session_id VARCHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
  expires_at DATETIME(3) NOT NULL,
  FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE mfa_attempt_budgets (
  user_id VARCHAR(36) COLLATE utf8mb4_bin PRIMARY KEY,
  window_id BIGINT NOT NULL,
  hits INT UNSIGNED NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE mfa_used_codes (
  user_id VARCHAR(36) COLLATE utf8mb4_bin NOT NULL,
  code_digest CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, code_digest),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE simulation_control (
  id TINYINT UNSIGNED PRIMARY KEY,
  paused BOOLEAN NOT NULL DEFAULT false,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO simulation_control (id, paused) VALUES (1, false);

CREATE TABLE security_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id VARCHAR(36) COLLATE utf8mb4_bin,
  subject_user_id VARCHAR(36) COLLATE utf8mb4_bin,
  action ENUM('admin_grant', 'admin_revoke', 'simulation_pause', 'simulation_resume') NOT NULL,
  reason VARCHAR(300) NOT NULL,
  source ENUM('operator-cli', 'admin-session') NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (actor_user_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (subject_user_id) REFERENCES user(id) ON DELETE SET NULL
) ENGINE=InnoDB;
