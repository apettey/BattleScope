import { z } from 'zod';
import type { SpaceType } from '@battlescope/shared';

export const SpaceTypeSchema = z.enum(['kspace', 'jspace', 'pochven']);

const nonNegativeBigint = z
  .coerce
  .bigint()
  .refine((value) => value >= 0n, { message: 'Expected non-negative bigint' });

export const BattleInsertSchema = z.object({
  id: z.string().uuid(),
  systemId: nonNegativeBigint,
  spaceType: SpaceTypeSchema,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  totalKills: nonNegativeBigint,
  totalIskDestroyed: nonNegativeBigint,
  zkillRelatedUrl: z.string().url(),
});

export type BattleInsert = z.infer<typeof BattleInsertSchema>;

export const BattleKillmailInsertSchema = z.object({
  battleId: z.string().uuid(),
  killmailId: nonNegativeBigint,
  zkbUrl: z.string().url(),
  occurredAt: z.coerce.date(),
  victimAllianceId: nonNegativeBigint.nullable(),
  attackerAllianceIds: z.array(nonNegativeBigint),
  iskValue: nonNegativeBigint.nullable(),
  sideId: nonNegativeBigint.nullable(),
});

export type BattleKillmailInsert = z.infer<typeof BattleKillmailInsertSchema>;

export const BattleParticipantInsertSchema = z.object({
  battleId: z.string().uuid(),
  characterId: nonNegativeBigint,
  allianceId: nonNegativeBigint.nullable(),
  corpId: nonNegativeBigint.nullable(),
  shipTypeId: nonNegativeBigint.nullable(),
  sideId: nonNegativeBigint.nullable(),
  isVictim: z.boolean(),
});

export type BattleParticipantInsert = z.infer<typeof BattleParticipantInsertSchema>;

export interface BattleRecord extends BattleInsert {
  createdAt: Date;
}

export interface BattleKillmailRecord {
  battleId: string;
  killmailId: bigint;
  zkbUrl: string;
  occurredAt: Date;
  victimAllianceId: bigint | null;
  victimCorpId: bigint | null;
  victimCharacterId: bigint | null;
  attackerAllianceIds: bigint[];
  attackerCorpIds: bigint[];
  attackerCharacterIds: bigint[];
  iskValue: bigint | null;
  sideId: bigint | null;
  enrichment: KillmailEnrichmentRecord | null;
}

export interface BattleParticipantRecord {
  battleId: string;
  characterId: bigint;
  allianceId: bigint | null;
  corpId: bigint | null;
  shipTypeId: bigint | null;
  sideId: bigint | null;
  isVictim: boolean;
}

export interface BattleWithDetails extends BattleRecord {
  killmails: BattleKillmailRecord[];
  participants: BattleParticipantRecord[];
}

export const KillmailEventSchema = z.object({
  killmailId: nonNegativeBigint,
  systemId: nonNegativeBigint,
  occurredAt: z.coerce.date(),
  victimAllianceId: nonNegativeBigint.nullable(),
  victimCorpId: nonNegativeBigint.nullable(),
  victimCharacterId: nonNegativeBigint.nullable(),
  attackerAllianceIds: z.array(nonNegativeBigint).default([]),
  attackerCorpIds: z.array(nonNegativeBigint).default([]),
  attackerCharacterIds: z.array(nonNegativeBigint).default([]),
  iskValue: nonNegativeBigint.nullable(),
  zkbUrl: z.string().url(),
  fetchedAt: z.coerce.date().optional(),
});

export type KillmailEventInsert = z.infer<typeof KillmailEventSchema>;

export interface KillmailEventRecord {
  killmailId: bigint;
  systemId: bigint;
  occurredAt: Date;
  victimAllianceId: bigint | null;
  victimCorpId: bigint | null;
  victimCharacterId: bigint | null;
  attackerAllianceIds: bigint[];
  attackerCorpIds: bigint[];
  attackerCharacterIds: bigint[];
  iskValue: bigint | null;
  zkbUrl: string;
  fetchedAt: Date;
  processedAt: Date | null;
  battleId: string | null;
}

export type { SpaceType };

export const KillmailEnrichmentStatusSchema = z.enum([
  'pending',
  'processing',
  'succeeded',
  'failed',
]);

export const KillmailEnrichmentSchema = z.object({
  killmailId: nonNegativeBigint,
  status: KillmailEnrichmentStatusSchema,
  payload: z.record(z.any()).nullable().optional(),
  error: z.string().nullable().optional(),
  fetchedAt: z.coerce.date().nullable().optional(),
  updatedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export type KillmailEnrichmentRecord = z.infer<typeof KillmailEnrichmentSchema>;
