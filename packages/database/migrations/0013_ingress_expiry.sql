CREATE EVENT ingress_counter_expiry
  ON SCHEDULE EVERY 1 MINUTE
  DO DELETE FROM ingress_budget_clients
    WHERE window_id < FLOOR(UNIX_TIMESTAMP()/60)-1
    LIMIT 4096;
