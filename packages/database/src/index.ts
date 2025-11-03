export { createDb, createPool, type DatabaseClient } from './client';
export { loadDatabaseConfig, type DatabaseConfig } from './env';
export { BattleRepository } from './repositories/battle-repository';
export { KillmailRepository } from './repositories/killmail-repository';
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
} from './types';
export { createInMemoryDatabase, type InMemoryDatabase } from './testing';
