-- Add ESI API Keys table for authenticated requests
-- This allows storing multiple ESI access tokens from different characters
-- to maximize request throughput with ESI's rate limiting system

CREATE TABLE esi_api_keys (
  id SERIAL PRIMARY KEY,
  character_id BIGINT NOT NULL,
  character_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(character_id)
);

CREATE INDEX idx_esi_api_keys_active ON esi_api_keys(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_esi_api_keys_expires_at ON esi_api_keys(expires_at);

-- Add rate limit tracking table for ESI's token bucket system
-- This tracks per-route rate limits using Redis for distributed coordination
CREATE TABLE esi_rate_limit_groups (
  rate_limit_group TEXT PRIMARY KEY,
  limit_count INT NOT NULL,
  window_seconds INT NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE esi_api_keys IS 'Stores ESI API access tokens from multiple characters for authenticated requests';
COMMENT ON TABLE esi_rate_limit_groups IS 'Tracks ESI rate limit groups discovered from X-Ratelimit headers';
