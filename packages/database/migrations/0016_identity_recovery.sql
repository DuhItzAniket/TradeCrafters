ALTER TABLE security_audit
  MODIFY COLUMN action ENUM('admin_grant', 'admin_revoke', 'simulation_pause', 'simulation_resume', 'execution_pause', 'execution_resume', 'identity_recovery') NOT NULL,
  ADD COLUMN case_key CHAR(36) COLLATE utf8mb4_bin NULL,
  ADD UNIQUE KEY identity_recovery_case (case_key);
