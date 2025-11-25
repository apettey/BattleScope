-- Ingestion Service Database Schema
-- This migration creates the killmail_events table for deduplication and tracking

CREATE TABLE IF NOT EXISTS killmail_events (
  killmail_id BIGINT PRIMARY KEY,
  system_id BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  victim_alliance_id BIGINT,
  attacker_alliance_ids BIGINT[],
  isk_value BIGINT,
  zkb_url TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  battle_id UUID
);

-- Index for time-based queries (most recent killmails)
CREATE INDEX idx_killmail_events_occurred_at ON killmail_events(occurred_at DESC);

-- Index for system-based queries
CREATE INDEX idx_killmail_events_system_id ON killmail_events(system_id);

-- Index for finding unprocessed killmails
CREATE INDEX idx_killmail_events_processed_at ON killmail_events(processed_at) WHERE processed_at IS NULL;

-- Index for battle association
CREATE INDEX idx_killmail_events_battle_id ON killmail_events(battle_id) WHERE battle_id IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE killmail_events IS 'Stores all ingested killmails from ZKillboard for deduplication and tracking';
COMMENT ON COLUMN killmail_events.killmail_id IS 'Unique killmail ID from ESI/ZKillboard';
COMMENT ON COLUMN killmail_events.system_id IS 'Solar system ID where the kill occurred';
COMMENT ON COLUMN killmail_events.occurred_at IS 'Timestamp when the kill occurred in-game';
COMMENT ON COLUMN killmail_events.fetched_at IS 'Timestamp when we fetched this killmail from ZKillboard';
COMMENT ON COLUMN killmail_events.victim_alliance_id IS 'Alliance ID of the victim (if any)';
COMMENT ON COLUMN killmail_events.attacker_alliance_ids IS 'Array of unique alliance IDs from all attackers';
COMMENT ON COLUMN killmail_events.isk_value IS 'Total ISK value of the kill from ZKillboard';
COMMENT ON COLUMN killmail_events.zkb_url IS 'ZKillboard URL for this killmail';
COMMENT ON COLUMN killmail_events.raw_data IS 'Complete raw killmail data from ZKillboard in JSONB format';
COMMENT ON COLUMN killmail_events.processed_at IS 'Timestamp when this killmail was processed by downstream services';
COMMENT ON COLUMN killmail_events.battle_id IS 'Associated battle ID if this killmail is part of a battle';
