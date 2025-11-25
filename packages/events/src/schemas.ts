import { z } from 'zod';

// Killmail schemas
export const KillmailVictimSchema = z.object({
  characterId: z.number().optional(),
  characterName: z.string().optional(),
  corporationId: z.number(),
  corporationName: z.string().optional(),
  allianceId: z.number().optional(),
  allianceName: z.string().optional(),
  shipTypeId: z.number(),
  shipTypeName: z.string().optional(),
  damageTaken: z.number(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
});

export const KillmailAttackerSchema = z.object({
  characterId: z.number().optional(),
  characterName: z.string().optional(),
  corporationId: z.number().optional(),
  corporationName: z.string().optional(),
  allianceId: z.number().optional(),
  allianceName: z.string().optional(),
  shipTypeId: z.number().optional(),
  shipTypeName: z.string().optional(),
  weaponTypeId: z.number().optional(),
  weaponTypeName: z.string().optional(),
  damageDone: z.number(),
  finalBlow: z.boolean(),
});

export const KillmailSchema = z.object({
  killmailId: z.number(),
  killmailHash: z.string(),
  killmailTime: z.date(),
  solarSystemId: z.number(),
  victim: KillmailVictimSchema,
  attackers: z.array(KillmailAttackerSchema),
  zkb: z.object({
    totalValue: z.number(),
    points: z.number(),
    npc: z.boolean(),
    solo: z.boolean(),
    awox: z.boolean(),
  }).optional(),
});

// Battle schemas
export const BattleSchema = z.object({
  id: z.string(),
  systemId: z.number(),
  systemName: z.string(),
  regionId: z.number(),
  regionName: z.string(),
  startTime: z.date(),
  endTime: z.date(),
  totalKills: z.number(),
  totalValue: z.number(),
  participants: z.number(),
  alliances: z.array(z.string()),
  corporations: z.array(z.string()),
});

// Event schemas
export const KillmailEventSchema = z.object({
  type: z.literal('killmail.received'),
  data: KillmailSchema,
  timestamp: z.date(),
});

export const KillmailEnrichedEventSchema = z.object({
  type: z.literal('killmail.enriched'),
  data: KillmailSchema,
  timestamp: z.date(),
});

export const BattleDetectedEventSchema = z.object({
  type: z.literal('battle.detected'),
  data: z.object({
    battleId: z.string(),
    systemId: z.number(),
    startTime: z.date(),
  }),
  timestamp: z.date(),
});

export const BattleUpdatedEventSchema = z.object({
  type: z.literal('battle.updated'),
  data: BattleSchema,
  timestamp: z.date(),
});

export const NotificationEventSchema = z.object({
  type: z.literal('notification.created'),
  data: z.object({
    userId: z.string(),
    title: z.string(),
    message: z.string(),
    category: z.string(),
    relatedId: z.string().optional(),
  }),
  timestamp: z.date(),
});

export const EventSchema = z.union([
  KillmailEventSchema,
  KillmailEnrichedEventSchema,
  BattleDetectedEventSchema,
  BattleUpdatedEventSchema,
  NotificationEventSchema,
]);
