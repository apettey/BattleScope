export { createDb, createPool, type DatabaseClient } from './client';
export { loadDatabaseConfig, type DatabaseConfig } from './env';
export { BattleRepository } from './repositories/battle-repository';
export type { Database } from './schema';
export {
  BattleInsertSchema,
  BattleKillmailInsertSchema,
  BattleParticipantInsertSchema,
  SpaceTypeSchema,
  type BattleInsert,
  type BattleKillmailInsert,
  type BattleParticipantInsert,
  type BattleRecord,
  type BattleKillmailRecord,
  type BattleParticipantRecord,
  type BattleWithDetails,
  type SpaceType,
} from './types';
