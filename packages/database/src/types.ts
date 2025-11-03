import { z } from 'zod';
import type { SpaceType } from '@battlescope/shared';

export const SpaceTypeSchema = z.enum(['kspace', 'jspace', 'pochven']);

export const BattleInsertSchema = z.object({
  id: z.string().uuid(),
  systemId: z.number().int(),
  spaceType: SpaceTypeSchema,
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  totalKills: z.number().int().nonnegative(),
  totalIskDestroyed: z.bigint().nonnegative(),
  zkillRelatedUrl: z.string().url(),
});

export type BattleInsert = z.infer<typeof BattleInsertSchema>;

export const BattleKillmailInsertSchema = z.object({
  battleId: z.string().uuid(),
  killmailId: z.number().int().nonnegative(),
  zkbUrl: z.string().url(),
  occurredAt: z.coerce.date(),
  victimAllianceId: z.number().int().nonnegative().nullable(),
  attackerAllianceIds: z.array(z.number().int().nonnegative()),
  iskValue: z.bigint().nonnegative().nullable(),
  sideId: z.number().int().nonnegative().nullable(),
});

export type BattleKillmailInsert = z.infer<typeof BattleKillmailInsertSchema>;

export const BattleParticipantInsertSchema = z.object({
  battleId: z.string().uuid(),
  characterId: z.number().int().nonnegative(),
  allianceId: z.number().int().nonnegative().nullable(),
  corpId: z.number().int().nonnegative().nullable(),
  shipTypeId: z.number().int().nonnegative().nullable(),
  sideId: z.number().int().nonnegative().nullable(),
  isVictim: z.boolean(),
});

export type BattleParticipantInsert = z.infer<typeof BattleParticipantInsertSchema>;

export interface BattleRecord extends BattleInsert {
  createdAt: Date;
}

export interface BattleKillmailRecord {
  battleId: string;
  killmailId: number;
  zkbUrl: string;
  occurredAt: Date;
  victimAllianceId: number | null;
  victimCorpId: number | null;
  victimCharacterId: bigint | null;
  attackerAllianceIds: number[];
  attackerCorpIds: number[];
  attackerCharacterIds: bigint[];
  iskValue: bigint | null;
  sideId: number | null;
}

export interface BattleParticipantRecord {
  battleId: string;
  characterId: number;
  allianceId: number | null;
  corpId: number | null;
  shipTypeId: number | null;
  sideId: number | null;
  isVictim: boolean;
}

export interface BattleWithDetails extends BattleRecord {
  killmails: BattleKillmailRecord[];
  participants: BattleParticipantRecord[];
}

export const KillmailEventSchema = z.object({
  killmailId: z.number().int().nonnegative(),
  systemId: z.number().int().nonnegative(),
  occurredAt: z.coerce.date(),
  victimAllianceId: z.number().int().nonnegative().nullable(),
  victimCorpId: z.number().int().nonnegative().nullable(),
  victimCharacterId: z.bigint().nonnegative().nullable(),
  attackerAllianceIds: z.array(z.number().int().nonnegative()).default([]),
  attackerCorpIds: z.array(z.number().int().nonnegative()).default([]),
  attackerCharacterIds: z.array(z.bigint().nonnegative()).default([]),
  iskValue: z.bigint().nonnegative().nullable(),
  zkbUrl: z.string().url(),
  fetchedAt: z.coerce.date().optional(),
});

export type KillmailEventInsert = z.infer<typeof KillmailEventSchema>;

export interface KillmailEventRecord {
  killmailId: number;
  systemId: number;
  occurredAt: Date;
  victimAllianceId: number | null;
  victimCorpId: number | null;
  victimCharacterId: bigint | null;
  attackerAllianceIds: number[];
  attackerCorpIds: number[];
  attackerCharacterIds: bigint[];
  iskValue: bigint | null;
  zkbUrl: string;
  fetchedAt: Date;
  processedAt: Date | null;
  battleId: string | null;
}

export type { SpaceType };
