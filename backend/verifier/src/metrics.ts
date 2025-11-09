import { Counter, Histogram, Gauge, Registry } from 'prom-client';

// Create a custom registry for the verifier metrics
export const register = new Registry();

/**
 * Duration of character verification job in seconds
 */
export const verificationJobDuration = new Histogram({
  name: 'battlescope_character_verification_duration_seconds',
  help: 'Duration of character verification job',
  registers: [register],
});

/**
 * Total characters verified
 */
export const charactersProcessed = new Counter({
  name: 'battlescope_characters_verified_total',
  help: 'Total characters verified',
  labelNames: ['status'] as const, // success, failed, skipped
  registers: [register],
});

/**
 * Total organization changes detected
 */
export const organizationChanges = new Counter({
  name: 'battlescope_character_org_changes_total',
  help: 'Total organization changes detected',
  labelNames: ['type'] as const, // corp, alliance, both
  registers: [register],
});

/**
 * Total sessions invalidated due to org changes
 */
export const sessionsInvalidated = new Counter({
  name: 'battlescope_sessions_invalidated_total',
  help: 'Total sessions invalidated due to org changes',
  labelNames: ['reason'] as const, // organization_changed
  registers: [register],
});

/**
 * ESI errors during verification
 */
export const esiErrors = new Counter({
  name: 'battlescope_character_verification_esi_errors_total',
  help: 'ESI errors during verification',
  labelNames: ['error_code'] as const, // 429, 500, timeout, etc
  registers: [register],
});

/**
 * Unix timestamp of last verification run
 */
export const lastRunTimestamp = new Gauge({
  name: 'battlescope_character_verification_last_run_timestamp',
  help: 'Unix timestamp of last verification run',
  registers: [register],
});

/**
 * Total number of characters checked in last run
 */
export const totalCharactersGauge = new Gauge({
  name: 'battlescope_character_verification_total_characters',
  help: 'Total number of characters checked in last run',
  registers: [register],
});

/**
 * Number of characters that failed verification
 */
export const failedCharactersGauge = new Gauge({
  name: 'battlescope_character_verification_failed_characters',
  help: 'Number of characters that failed verification',
  registers: [register],
});
