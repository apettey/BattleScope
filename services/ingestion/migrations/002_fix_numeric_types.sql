-- Fix numeric types to support decimal values
-- ISK values from ZKillboard can have decimal places, so we need to use NUMERIC instead of BIGINT

-- Change isk_value from BIGINT to NUMERIC to support decimal ISK values
ALTER TABLE killmail_events
  ALTER COLUMN isk_value TYPE NUMERIC USING isk_value::NUMERIC;

-- Update the comment to reflect the change
COMMENT ON COLUMN killmail_events.isk_value IS 'Total ISK value of the kill from ZKillboard (supports decimals)';
