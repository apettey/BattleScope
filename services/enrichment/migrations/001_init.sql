-- Enrichment Service Database Schema
-- Stores enriched killmail data and ESI cache

-- Create enriched_killmails table
CREATE TABLE enriched_killmails (
  killmail_id BIGINT PRIMARY KEY,
  ship_type_id BIGINT NOT NULL,
  ship_type_name TEXT NOT NULL,
  ship_group_name TEXT NOT NULL,
  system_id BIGINT NOT NULL,
  system_name TEXT NOT NULL,
  region_id BIGINT NOT NULL,
  region_name TEXT NOT NULL,
  security_status DECIMAL NOT NULL,
  victim_character_id BIGINT,
  victim_character_name TEXT,
  victim_corp_id BIGINT,
  victim_corp_name TEXT,
  victim_alliance_id BIGINT,
  victim_alliance_name TEXT,
  attacker_data JSONB NOT NULL,
  raw_killmail_data JSONB NOT NULL,
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1
);

-- Create indexes for common queries
CREATE INDEX idx_enriched_killmails_enriched_at ON enriched_killmails(enriched_at DESC);
CREATE INDEX idx_enriched_killmails_system_id ON enriched_killmails(system_id);
CREATE INDEX idx_enriched_killmails_ship_type_id ON enriched_killmails(ship_type_id);
CREATE INDEX idx_enriched_killmails_victim_character_id ON enriched_killmails(victim_character_id) WHERE victim_character_id IS NOT NULL;
CREATE INDEX idx_enriched_killmails_victim_alliance_id ON enriched_killmails(victim_alliance_id) WHERE victim_alliance_id IS NOT NULL;

-- Create ESI cache table
CREATE TABLE esi_cache (
  cache_key TEXT PRIMARY KEY,
  cache_value JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create index for cache expiration cleanup
CREATE INDEX idx_esi_cache_expires_at ON esi_cache(expires_at);

-- Create enrichment stats table for monitoring
CREATE TABLE enrichment_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  killmails_processed INT NOT NULL DEFAULT 0,
  esi_api_calls INT NOT NULL DEFAULT 0,
  esi_cache_hits INT NOT NULL DEFAULT 0,
  esi_cache_misses INT NOT NULL DEFAULT 0,
  errors_count INT NOT NULL DEFAULT 0,
  avg_processing_time_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date)
);

CREATE INDEX idx_enrichment_stats_date ON enrichment_stats(date DESC);
