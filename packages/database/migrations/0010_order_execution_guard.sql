-- @single-statement
CREATE TRIGGER order_execution_guard BEFORE INSERT ON orders FOR EACH ROW
BEGIN
  DECLARE stopped BOOLEAN DEFAULT true;
  SELECT execution_paused INTO stopped FROM simulation_control WHERE id = 1 FOR SHARE;
  IF stopped IS NULL OR stopped THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TRADECRAFTERS_EXECUTION_PAUSED';
  END IF;
END;
