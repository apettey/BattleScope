export { createDb, createPool, type DatabaseClient } from './client';
export { loadDatabaseConfig, type DatabaseConfig } from './env';
export { BattleRepository } from './repositories/battle-repository';
export type { BattleFilters, BattleCursor } from './repositories/battle-repository';
export { KillmailRepository } from './repositories/killmail-repository';
export { KillmailEnrichmentRepository } from './repositories/killmail-enrichment-repository';
export type { Database } from './schema';
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
} from './types';
export { createInMemoryDatabase, type InMemoryDatabase } from './testing';
