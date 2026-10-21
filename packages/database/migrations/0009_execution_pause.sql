ALTER TABLE simulation_control
  ADD COLUMN execution_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE security_audit
  MODIFY COLUMN action ENUM('admin_grant', 'admin_revoke', 'simulation_pause', 'simulation_resume', 'execution_pause', 'execution_resume') NOT NULL;
