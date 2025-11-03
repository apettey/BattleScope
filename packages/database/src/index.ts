export { createDb, createPool, type DatabaseClient } from './client.js';
export { loadDatabaseConfig, type DatabaseConfig } from './env.js';
export { BattleRepository } from './repositories/battle-repository.js';
export type { BattleFilters, BattleCursor } from './repositories/battle-repository.js';
export { KillmailRepository } from './repositories/killmail-repository.js';
export { KillmailEnrichmentRepository } from './repositories/killmail-enrichment-repository.js';
export type { Database } from './schema.js';
export {
  BattleInsertSchema,
  BattleKillmailInsertSchema,
  BattleParticipantInsertSchema,
  SpaceTypeSchema,
  KillmailEventSchema,
  type BattleInsert,
  type BattleKillmailInsert,
  type BattleParticipantInsert,
  type BattleRecord,
  type BattleKillmailRecord,
  type BattleParticipantRecord,
  type BattleWithDetails,
  type SpaceType,
  type KillmailEventInsert,
  type KillmailEventRecord,
  type KillmailEnrichmentRecord,
  KillmailEnrichmentStatusSchema,
} from './types.js';
export { createInMemoryDatabase, type InMemoryDatabase } from './testing.js';
