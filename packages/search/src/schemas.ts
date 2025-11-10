/**
 * Typesense Collection Schemas
 *
 * Defines the collection schemas for battles, entities, and systems
 */

// Collection schema type (based on Typesense API)
interface CollectionField {
  name: string;
  type: string;
  facet?: boolean;
  optional?: boolean;
}

interface CollectionCreateSchema {
  name: string;
  fields: CollectionField[];
  default_sorting_field?: string;
}

/**
 * Battles Collection Schema
 *
 * Stores searchable battle data with metadata for filtering and sorting
 */
export const BATTLES_COLLECTION_SCHEMA: CollectionCreateSchema = {
  name: 'battles',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'systemId', type: 'string' },
    { name: 'systemName', type: 'string' },
    { name: 'regionName', type: 'string' },
    { name: 'securityType', type: 'string', facet: true },
    { name: 'startTime', type: 'int64' }, // Unix timestamp
    { name: 'endTime', type: 'int64' },
    { name: 'duration', type: 'int32' }, // seconds
    { name: 'totalKills', type: 'int32' },
    { name: 'totalParticipants', type: 'int32' },
    { name: 'totalIskDestroyed', type: 'int64' },
    { name: 'allianceNames', type: 'string[]' },
    { name: 'battleScore', type: 'int32' }, // Composite score for ranking
  ],
  default_sorting_field: 'startTime',
};

/**
 * Entities Collection Schema
 *
 * Stores alliances, corporations, and characters that have participated in battles
 */
export const ENTITIES_COLLECTION_SCHEMA: CollectionCreateSchema = {
  name: 'entities',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'type', type: 'string', facet: true }, // alliance, corporation, character
    { name: 'name', type: 'string' },
    { name: 'ticker', type: 'string', optional: true },
    { name: 'allianceId', type: 'string', optional: true },
    { name: 'allianceName', type: 'string', optional: true },
    { name: 'corpId', type: 'string', optional: true },
    { name: 'corpName', type: 'string', optional: true },
    { name: 'battleCount', type: 'int32' },
    { name: 'lastSeenAt', type: 'int64' }, // Unix timestamp
    { name: 'activityScore', type: 'int32' }, // Composite score for ranking
  ],
  default_sorting_field: 'activityScore',
};

/**
 * Systems Collection Schema
 *
 * Stores EVE Online solar systems where battles have occurred
 */
export const SYSTEMS_COLLECTION_SCHEMA: CollectionCreateSchema = {
  name: 'systems',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'regionId', type: 'string' },
    { name: 'regionName', type: 'string' },
    { name: 'constellationId', type: 'string' },
    { name: 'constellationName', type: 'string' },
    { name: 'securityType', type: 'string', facet: true },
    { name: 'securityStatus', type: 'float' }, // -1.0 to 1.0
    { name: 'battleCount', type: 'int32' },
    { name: 'lastBattleAt', type: 'int64', optional: true }, // Unix timestamp
    { name: 'activityScore', type: 'int32' }, // Composite score for ranking
  ],
  default_sorting_field: 'activityScore',
};

/**
 * All collection schemas for easy iteration
 */
export const ALL_SCHEMAS = [
  BATTLES_COLLECTION_SCHEMA,
  ENTITIES_COLLECTION_SCHEMA,
  SYSTEMS_COLLECTION_SCHEMA,
];

/**
 * Calculate activity score for entities
 *
 * Combines battle count with recency to prioritize active entities
 */
export function calculateEntityActivityScore(battleCount: number, lastSeenAt: Date): number {
  const now = Date.now();
  const daysSinceLastSeen = (now - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24);

  // Decay factor: 1.0 if seen today, 0.5 if seen 30 days ago, 0.1 if seen 90+ days ago
  const decayFactor = Math.max(0.1, 1 - daysSinceLastSeen / 90);

  return Math.floor(battleCount * decayFactor * 100);
}

/**
 * Calculate activity score for systems
 *
 * Combines battle count with recency to prioritize active systems
 */
export function calculateSystemActivityScore(
  battleCount: number,
  lastBattleAt: Date | null,
): number {
  if (!lastBattleAt) {
    return 0;
  }

  const now = Date.now();
  const daysSinceLastBattle = (now - lastBattleAt.getTime()) / (1000 * 60 * 60 * 24);

  // Decay factor: 1.0 if battle today, 0.5 if 30 days ago, 0.1 if 90+ days ago
  const decayFactor = Math.max(0.1, 1 - daysSinceLastBattle / 90);

  return Math.floor(battleCount * decayFactor * 100);
}

/**
 * Calculate battle score for ranking
 *
 * Combines ISK destroyed, kills, participants, and duration into a single score
 */
export function calculateBattleScore(
  totalIskDestroyed: bigint,
  totalKills: number,
  totalParticipants: number,
  duration: number,
): number {
  // Normalize ISK to billions
  const iskBillions = Number(totalIskDestroyed) / 1_000_000_000;

  // Weight components
  const iskScore = iskBillions * 10; // 10 points per billion
  const killScore = totalKills * 1; // 1 point per kill
  const participantScore = totalParticipants * 2; // 2 points per participant
  const durationScore = Math.min(duration / 60, 180) * 0.5; // 0.5 points per minute, max 90 minutes

  return Math.floor(iskScore + killScore + participantScore + durationScore);
}
