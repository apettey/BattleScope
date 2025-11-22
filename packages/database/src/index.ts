export { createDb, createPool, type DatabaseClient } from './client.js';
export { loadDatabaseConfig, type DatabaseConfig } from './env.js';
export { BattleRepository } from './repositories/battle-repository.js';
export type { BattleFilters, BattleCursor } from './repositories/battle-repository.js';
export { KillmailRepository } from './repositories/killmail-repository.js';
export { KillmailEnrichmentRepository } from './repositories/killmail-enrichment-repository.js';
export { RulesetRepository } from './repositories/ruleset-repository.js';
export { DashboardRepository } from './repositories/dashboard-repository.js';
export { PilotShipHistoryRepository } from './repositories/pilot-ship-history-repository.js';
export type { Database } from './schema.js';
export {
  BattleInsertSchema,
  BattleKillmailInsertSchema,
  BattleParticipantInsertSchema,
  KillmailEventSchema,
  RulesetSchema,
  RulesetUpdateSchema,
  KillmailFeedItemSchema,
  SecurityTypeSchema,
  type BattleInsert,
  type BattleKillmailInsert,
  type BattleParticipantInsert,
  type BattleRecord,
  type BattleKillmailRecord,
  type BattleParticipantRecord,
  type BattleWithDetails,
  type KillmailEventInsert,
  type KillmailEventRecord,
  type KillmailEnrichmentRecord,
  type RulesetRecord,
  type RulesetUpdate,
  type KillmailFeedItem,
  type DashboardSummary,
  type SecurityType,
  KillmailEnrichmentStatusSchema,
  PilotShipHistoryInsertSchema,
  type PilotShipHistoryInsert,
  type PilotShipHistoryRecord,
  type CharacterShipSummary,
  type CharacterLossRecord,
} from './types.js';
export * from './repositories/auth/index.js';
