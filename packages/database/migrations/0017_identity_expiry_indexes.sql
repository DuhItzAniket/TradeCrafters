CREATE INDEX session_expiry ON session (expiresAt);
CREATE INDEX verification_expiry ON verification (expiresAt);
CREATE INDEX stepup_expiry ON mfa_stepups (expires_at);
CREATE INDEX used_code_expiry ON mfa_used_codes (expires_at);
CREATE INDEX mfa_budget_expiry ON mfa_attempt_budgets (window_id);
CREATE INDEX mutation_budget_expiry ON mutation_budgets (window_id);
