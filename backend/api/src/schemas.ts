import { z } from 'zod';

// Common schemas
export const SpaceTypeSchema = z.enum(['kspace', 'jspace', 'pochven']);
export const SecurityTypeSchema = z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven']);

export const ErrorResponseSchema = z.object({
  message: z.string(),
});

// Battle schemas
export const BattleSummarySchema = z.object({
  id: z.string().uuid(),
  systemId: z.string(),
  systemName: z.string().nullable(),
  spaceType: SpaceTypeSchema,
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  totalKills: z.string(),
  totalIskDestroyed: z.string(),
  zkillRelatedUrl: z.string().url(),
});

export const KillmailEnrichmentSchema = z.object({
  status: z.enum(['pending', 'processing', 'succeeded', 'failed']),
  payload: z.record(z.any()).nullable(),
  error: z.string().nullable(),
  fetchedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const KillmailDetailSchema = z.object({
  killmailId: z.string(),
  occurredAt: z.string().datetime(),
  victimAllianceId: z.string().nullable(),
  victimAllianceName: z.string().nullable(),
  victimCorpId: z.string().nullable(),
  victimCorpName: z.string().nullable(),
  victimCharacterId: z.string().nullable(),
  victimCharacterName: z.string().nullable(),
  attackerAllianceIds: z.array(z.string()),
  attackerAllianceNames: z.array(z.string().nullable()),
  attackerCorpIds: z.array(z.string()),
  attackerCorpNames: z.array(z.string().nullable()),
  attackerCharacterIds: z.array(z.string()),
  attackerCharacterNames: z.array(z.string().nullable()),
  iskValue: z.string().nullable(),
  zkbUrl: z.string().url(),
  enrichment: KillmailEnrichmentSchema.nullable(),
});

export const BattleParticipantSchema = z.object({
  battleId: z.string().uuid(),
  characterId: z.string(),
  characterName: z.string().nullable(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  corpId: z.string().nullable(),
  corpName: z.string().nullable(),
  shipTypeId: z.string().nullable(),
  shipTypeName: z.string().nullable(),
  sideId: z.string().nullable(),
  isVictim: z.boolean(),
});

export const BattleDetailSchema = BattleSummarySchema.extend({
  createdAt: z.string().datetime(),
  killmails: z.array(KillmailDetailSchema),
  participants: z.array(BattleParticipantSchema),
});

export const BattleListResponseSchema = z.object({
  items: z.array(BattleSummarySchema),
  nextCursor: z.string().nullable(),
});

// Query parameter schemas
export const BattleListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  spaceType: SpaceTypeSchema.optional(),
  systemId: z.string().regex(/^\d+$/).optional(),
  allianceId: z.string().regex(/^\d+$/).optional(),
  corpId: z.string().regex(/^\d+$/).optional(),
  characterId: z.string().regex(/^\d+$/).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});

export const BattleIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const EntityIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/),
});

// Killmail schemas
export const KillmailFeedItemSchema = z.object({
  killmailId: z.string(),
  systemId: z.string(),
  systemName: z.string().nullable(),
  occurredAt: z.string().datetime(),
  spaceType: SpaceTypeSchema,
  victimAllianceId: z.string().nullable(),
  victimAllianceName: z.string().nullable(),
  victimCorpId: z.string().nullable(),
  victimCorpName: z.string().nullable(),
  victimCharacterId: z.string().nullable(),
  victimCharacterName: z.string().nullable(),
  attackerAllianceIds: z.array(z.string()),
  attackerAllianceNames: z.array(z.string().nullable()),
  attackerCorpIds: z.array(z.string()),
  attackerCorpNames: z.array(z.string().nullable()),
  attackerCharacterIds: z.array(z.string()),
  attackerCharacterNames: z.array(z.string().nullable()),
  iskValue: z.string().nullable(),
  zkbUrl: z.string().url(),
  battleId: z.string().uuid().nullable(),
  participantCount: z.number().int(),
});

export const KillmailFeedResponseSchema = z.object({
  items: z.array(KillmailFeedItemSchema),
  count: z.number().int(),
});

export const KillmailRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  spaceType: z
    .union([SpaceTypeSchema, z.array(SpaceTypeSchema)])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return Array.isArray(value) ? [...new Set(value)] : [value];
    }),
  trackedOnly: z.coerce.boolean().optional().default(false),
});

export const KillmailStreamQuerySchema = KillmailRecentQuerySchema.extend({
  once: z.coerce.boolean().optional().default(false),
  pollIntervalMs: z.coerce.number().int().min(1000).max(60000).optional().default(5000),
});

// Dashboard schemas
export const TopAllianceSchema = z.object({
  allianceId: z.string(),
  allianceName: z.string().nullable(),
  battleCount: z.number().int(),
});

export const TopCorporationSchema = z.object({
  corpId: z.string(),
  corpName: z.string().nullable(),
  battleCount: z.number().int(),
});

export const DashboardSummarySchema = z.object({
  totalBattles: z.number().int(),
  totalKillmails: z.number().int(),
  uniqueAlliances: z.number().int(),
  uniqueCorporations: z.number().int(),
  topAlliances: z.array(TopAllianceSchema),
  topCorporations: z.array(TopCorporationSchema),
  generatedAt: z.string().datetime(),
});

// Ruleset schemas
export const RulesetSchema = z.object({
  id: z.string().uuid(),
  minPilots: z.number().int().min(1).max(500),
  trackedAllianceIds: z.array(z.string()),
  trackedAllianceNames: z.array(z.string().nullable()),
  trackedCorpIds: z.array(z.string()),
  trackedCorpNames: z.array(z.string().nullable()),
  trackedSystemIds: z.array(z.string()),
  trackedSystemNames: z.array(z.string().nullable()),
  trackedSecurityTypes: z.array(SecurityTypeSchema),
  ignoreUnlisted: z.boolean(),
  updatedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RulesetUpdateSchema = z.object({
  minPilots: z.coerce.number().int().min(1).max(500).optional(),
  trackedAllianceIds: z
    .array(z.union([z.coerce.bigint(), z.string(), z.number()]))
    .max(250)
    .optional(),
  trackedCorpIds: z
    .array(z.union([z.coerce.bigint(), z.string(), z.number()]))
    .max(250)
    .optional(),
  trackedSystemIds: z
    .array(z.union([z.coerce.bigint(), z.string(), z.number()]))
    .max(1000)
    .optional(),
  trackedSecurityTypes: z.array(SecurityTypeSchema).optional(),
  ignoreUnlisted: z.boolean().optional(),
  updatedBy: z.string().trim().min(1).max(128).optional(),
});

// Entity detail schemas
export const ShipUsageSchema = z.object({
  shipTypeId: z.string(),
  shipTypeName: z.string().nullable(),
  count: z.number().int(),
});

export const OpponentAllianceSchema = z.object({
  allianceId: z.string(),
  allianceName: z.string().nullable(),
  battleCount: z.number().int(),
});

export const OpponentCorpSchema = z.object({
  corpId: z.string(),
  corpName: z.string().nullable(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  battleCount: z.number().int(),
});

export const SystemUsageSchema = z.object({
  systemId: z.string(),
  systemName: z.string().nullable(),
  battleCount: z.number().int(),
});

export const TopPilotSchema = z.object({
  characterId: z.string(),
  characterName: z.string().nullable(),
  battleCount: z.number().int(),
});

export const AllianceStatisticsSchema = z.object({
  totalBattles: z.number().int(),
  totalKillmails: z.number().int(),
  totalIskDestroyed: z.string(),
  totalIskLost: z.string(),
  iskEfficiency: z.number(),
  averageParticipants: z.number(),
  mostUsedShips: z.array(ShipUsageSchema),
  topOpponents: z.array(OpponentAllianceSchema),
  topSystems: z.array(SystemUsageSchema),
});

export const AllianceDetailSchema = z.object({
  allianceId: z.string(),
  allianceName: z.string().nullable(),
  ticker: z.string().nullable(),
  statistics: AllianceStatisticsSchema,
});

export const CorporationStatisticsSchema = z.object({
  totalBattles: z.number().int(),
  totalKillmails: z.number().int(),
  totalIskDestroyed: z.string(),
  totalIskLost: z.string(),
  iskEfficiency: z.number(),
  averageParticipants: z.number(),
  mostUsedShips: z.array(ShipUsageSchema),
  topOpponents: z.array(OpponentAllianceSchema),
  topPilots: z.array(TopPilotSchema),
});

export const CorporationDetailSchema = z.object({
  corpId: z.string(),
  corpName: z.string().nullable(),
  ticker: z.string().nullable(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  statistics: CorporationStatisticsSchema,
});

export const CharacterStatisticsSchema = z.object({
  totalBattles: z.number().int(),
  totalKills: z.number().int(),
  totalLosses: z.number().int(),
  totalIskDestroyed: z.string(),
  totalIskLost: z.string(),
  iskEfficiency: z.number(),
  mostUsedShips: z.array(ShipUsageSchema),
  topOpponents: z.array(OpponentAllianceSchema),
  favoriteSystems: z.array(SystemUsageSchema),
});

export const CharacterDetailSchema = z.object({
  characterId: z.string(),
  characterName: z.string().nullable(),
  corpId: z.string().nullable(),
  corpName: z.string().nullable(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  statistics: CharacterStatisticsSchema,
});

export const BattleOpponentSchema = z.object({
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  corpId: z.string().nullable(),
  corpName: z.string().nullable(),
  participants: z.number().int(),
});

export const EntityBattleSummarySchema = BattleSummarySchema.extend({
  duration: z.number().int(),
  totalParticipants: z.number().int(),
  opponents: z.array(BattleOpponentSchema),
  shipComposition: z.array(ShipUsageSchema),
});

export const AllianceBattleSummarySchema = EntityBattleSummarySchema.extend({
  allianceParticipants: z.number().int(),
  allianceIskDestroyed: z.string(),
  allianceIskLost: z.string(),
});

export const AllianceBattleListResponseSchema = z.object({
  items: z.array(AllianceBattleSummarySchema),
  nextCursor: z.string().nullable(),
});

export const CorporationBattleSummarySchema = EntityBattleSummarySchema.extend({
  corpParticipants: z.number().int(),
  corpIskDestroyed: z.string(),
  corpIskLost: z.string(),
});

export const CorporationBattleListResponseSchema = z.object({
  items: z.array(CorporationBattleSummarySchema),
  nextCursor: z.string().nullable(),
});

export const CharacterBattleSummarySchema = EntityBattleSummarySchema.extend({
  characterKills: z.number().int(),
  characterLosses: z.number().int(),
  characterIskDestroyed: z.string(),
  characterIskLost: z.string(),
  shipsFlown: z.array(ShipUsageSchema),
});

export const CharacterBattleListResponseSchema = z.object({
  items: z.array(CharacterBattleSummarySchema),
  nextCursor: z.string().nullable(),
});

// Type exports
export type SpaceType = z.infer<typeof SpaceTypeSchema>;
export type BattleSummary = z.infer<typeof BattleSummarySchema>;
export type BattleDetail = z.infer<typeof BattleDetailSchema>;
export type BattleListResponse = z.infer<typeof BattleListResponseSchema>;
export type KillmailFeedItem = z.infer<typeof KillmailFeedItemSchema>;
export type KillmailFeedResponse = z.infer<typeof KillmailFeedResponseSchema>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type Ruleset = z.infer<typeof RulesetSchema>;
export type RulesetUpdate = z.infer<typeof RulesetUpdateSchema>;
export type AllianceDetail = z.infer<typeof AllianceDetailSchema>;
export type CorporationDetail = z.infer<typeof CorporationDetailSchema>;
export type CharacterDetail = z.infer<typeof CharacterDetailSchema>;
export type AllianceBattleSummary = z.infer<typeof AllianceBattleSummarySchema>;
export type CorporationBattleSummary = z.infer<typeof CorporationBattleSummarySchema>;
export type CharacterBattleSummary = z.infer<typeof CharacterBattleSummarySchema>;
