import type {
  BattleRecord,
  BattleWithDetails,
  BattleKillmailRecord,
  BattleParticipantRecord,
  RulesetRecord,
  KillmailFeedItem,
  DashboardSummary,
  KillmailEnrichmentStatusSchema,
} from '@battlescope/database';
import type { SpaceType } from '@battlescope/shared';
import type { z } from 'zod';

type EnrichmentStatus = z.infer<typeof KillmailEnrichmentStatusSchema>;

export type NameLookup = Map<string, string>;

const formatBigInt = (value: bigint | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toString();

const formatDate = (value: Date): string => value.toISOString();

const formatBigIntArray = (values: readonly bigint[]): string[] =>
  values.map((value) => value.toString());

const normalizeLookupKey = (value: bigint | number | string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      return null;
    }
    return value.toString();
  }

  return null;
};

const resolveName = (
  lookup: NameLookup,
  value: bigint | number | string | null | undefined,
): string | null => {
  const key = normalizeLookupKey(value);
  if (!key) {
    return null;
  }
  return lookup.get(key) ?? null;
};

const resolveNameArray = (
  lookup: NameLookup,
  values: readonly (bigint | number | string | null | undefined)[] | null | undefined,
): Array<string | null> => (values ?? []).map((value) => resolveName(lookup, value));

export interface BattleSummaryResponse {
  id: string;
  systemId: string;
  systemName: string | null;
  spaceType: SpaceType;
  startTime: string;
  endTime: string;
  totalKills: string;
  totalIskDestroyed: string;
  zkillRelatedUrl: string;
}

export interface BattleDetailResponse extends BattleSummaryResponse {
  createdAt: string;
  killmails: Array<{
    killmailId: string;
    occurredAt: string;
    victimAllianceId: string | null;
    victimAllianceName: string | null;
    victimCorpId: string | null;
    victimCorpName: string | null;
    victimCharacterId: string | null;
    victimCharacterName: string | null;
    attackerAllianceIds: string[];
    attackerAllianceNames: Array<string | null>;
    attackerCorpIds: string[];
    attackerCorpNames: Array<string | null>;
    attackerCharacterIds: string[];
    attackerCharacterNames: Array<string | null>;
    iskValue: string | null;
    zkbUrl: string;
    enrichment: {
      status: EnrichmentStatus;
      payload: Record<string, unknown> | null;
      error: string | null;
      fetchedAt: string | null;
      updatedAt: string;
      createdAt: string;
    } | null;
  }>;
  participants: Array<{
    battleId: string;
    characterId: string;
    characterName: string | null;
    allianceId: string | null;
    allianceName: string | null;
    corpId: string | null;
    corpName: string | null;
    shipTypeId: string | null;
    shipTypeName: string | null;
    sideId: string | null;
    isVictim: boolean;
  }>;
}

const toKillmailResponse = (killmail: BattleKillmailRecord, lookup: NameLookup) => ({
  killmailId: killmail.killmailId.toString(),
  occurredAt: formatDate(killmail.occurredAt),
  victimAllianceId: formatBigInt(killmail.victimAllianceId),
  victimAllianceName: resolveName(lookup, killmail.victimAllianceId),
  victimCorpId: formatBigInt(killmail.victimCorpId),
  victimCorpName: resolveName(lookup, killmail.victimCorpId),
  victimCharacterId: formatBigInt(killmail.victimCharacterId),
  victimCharacterName: resolveName(lookup, killmail.victimCharacterId),
  attackerAllianceIds: (killmail.attackerAllianceIds ?? []).map((id) => id.toString()),
  attackerAllianceNames: resolveNameArray(lookup, killmail.attackerAllianceIds),
  attackerCorpIds: (killmail.attackerCorpIds ?? []).map((id) => id.toString()),
  attackerCorpNames: resolveNameArray(lookup, killmail.attackerCorpIds),
  attackerCharacterIds: (killmail.attackerCharacterIds ?? []).map((id) => id.toString()),
  attackerCharacterNames: resolveNameArray(lookup, killmail.attackerCharacterIds),
  iskValue: formatBigInt(killmail.iskValue),
  zkbUrl: killmail.zkbUrl,
  enrichment: killmail.enrichment
    ? {
        status: killmail.enrichment.status,
        payload: killmail.enrichment.payload ?? null,
        error: killmail.enrichment.error ?? null,
        fetchedAt: killmail.enrichment.fetchedAt ? formatDate(killmail.enrichment.fetchedAt) : null,
        updatedAt: formatDate(killmail.enrichment.updatedAt),
        createdAt: formatDate(killmail.enrichment.createdAt),
      }
    : null,
});

export const toBattleSummaryResponse = (
  battle: BattleRecord,
  lookup: NameLookup,
): BattleSummaryResponse => ({
  id: battle.id,
  systemId: battle.systemId.toString(),
  systemName: resolveName(lookup, battle.systemId),
  spaceType: battle.spaceType,
  startTime: formatDate(battle.startTime),
  endTime: formatDate(battle.endTime),
  totalKills: battle.totalKills.toString(),
  totalIskDestroyed: battle.totalIskDestroyed.toString(),
  zkillRelatedUrl: battle.zkillRelatedUrl,
});

export const toBattleDetailResponse = (
  battle: BattleWithDetails,
  lookup: NameLookup,
): BattleDetailResponse => ({
  ...toBattleSummaryResponse(battle, lookup),
  createdAt: formatDate(battle.createdAt),
  killmails: battle.killmails.map((killmail) => toKillmailResponse(killmail, lookup)),
  participants: battle.participants.map((participant: BattleParticipantRecord) => ({
    battleId: participant.battleId,
    characterId: participant.characterId.toString(),
    characterName: resolveName(lookup, participant.characterId),
    allianceId: formatBigInt(participant.allianceId),
    allianceName: resolveName(lookup, participant.allianceId),
    corpId: formatBigInt(participant.corpId),
    corpName: resolveName(lookup, participant.corpId),
    shipTypeId: formatBigInt(participant.shipTypeId),
    shipTypeName: resolveName(lookup, participant.shipTypeId),
    sideId: formatBigInt(participant.sideId),
    isVictim: participant.isVictim,
  })),
});

export interface RulesetResponse {
  id: string;
  minPilots: number;
  trackedAllianceIds: string[];
  trackedAllianceNames: Array<string | null>;
  trackedCorpIds: string[];
  trackedCorpNames: Array<string | null>;
  ignoreUnlisted: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const toRulesetResponse = (ruleset: RulesetRecord, lookup: NameLookup): RulesetResponse => ({
  id: ruleset.id,
  minPilots: ruleset.minPilots,
  trackedAllianceIds: formatBigIntArray(ruleset.trackedAllianceIds),
  trackedAllianceNames: resolveNameArray(lookup, ruleset.trackedAllianceIds),
  trackedCorpIds: formatBigIntArray(ruleset.trackedCorpIds),
  trackedCorpNames: resolveNameArray(lookup, ruleset.trackedCorpIds),
  ignoreUnlisted: ruleset.ignoreUnlisted,
  updatedBy: ruleset.updatedBy ?? null,
  createdAt: formatDate(ruleset.createdAt),
  updatedAt: formatDate(ruleset.updatedAt),
});

export interface KillmailFeedItemResponse {
  killmailId: string;
  systemId: string;
  systemName: string | null;
  occurredAt: string;
  spaceType: SpaceType;
  victimAllianceId: string | null;
  victimAllianceName: string | null;
  victimCorpId: string | null;
  victimCorpName: string | null;
  victimCharacterId: string | null;
  victimCharacterName: string | null;
  attackerAllianceIds: string[];
  attackerAllianceNames: Array<string | null>;
  attackerCorpIds: string[];
  attackerCorpNames: Array<string | null>;
  attackerCharacterIds: string[];
  attackerCharacterNames: Array<string | null>;
  iskValue: string | null;
  zkbUrl: string;
  battleId: string | null;
  participantCount: number;
}

export const toKillmailFeedItemResponse = (
  item: KillmailFeedItem,
  lookup: NameLookup,
): KillmailFeedItemResponse => ({
  killmailId: item.killmailId.toString(),
  systemId: item.systemId.toString(),
  systemName: resolveName(lookup, item.systemId),
  occurredAt: formatDate(item.occurredAt),
  spaceType: item.spaceType,
  victimAllianceId: formatBigInt(item.victimAllianceId),
  victimAllianceName: resolveName(lookup, item.victimAllianceId),
  victimCorpId: formatBigInt(item.victimCorpId),
  victimCorpName: resolveName(lookup, item.victimCorpId),
  victimCharacterId: formatBigInt(item.victimCharacterId),
  victimCharacterName: resolveName(lookup, item.victimCharacterId),
  attackerAllianceIds: formatBigIntArray(item.attackerAllianceIds),
  attackerAllianceNames: resolveNameArray(lookup, item.attackerAllianceIds),
  attackerCorpIds: formatBigIntArray(item.attackerCorpIds),
  attackerCorpNames: resolveNameArray(lookup, item.attackerCorpIds),
  attackerCharacterIds: formatBigIntArray(item.attackerCharacterIds),
  attackerCharacterNames: resolveNameArray(lookup, item.attackerCharacterIds),
  iskValue: formatBigInt(item.iskValue),
  zkbUrl: item.zkbUrl,
  battleId: item.battleId,
  participantCount: item.participantCount,
});

export interface DashboardSummaryResponse {
  totalBattles: number;
  totalKillmails: number;
  uniqueAlliances: number;
  uniqueCorporations: number;
  topAlliances: Array<{ allianceId: string; allianceName: string | null; battleCount: number }>;
  topCorporations: Array<{ corpId: string; corpName: string | null; battleCount: number }>;
  generatedAt: string;
}

export const toDashboardSummaryResponse = (
  summary: DashboardSummary,
  lookup: NameLookup,
): DashboardSummaryResponse => ({
  totalBattles: summary.totalBattles,
  totalKillmails: summary.totalKillmails,
  uniqueAlliances: summary.uniqueAlliances,
  uniqueCorporations: summary.uniqueCorporations,
  topAlliances: summary.topAlliances.map((entry) => ({
    allianceId: entry.allianceId.toString(),
    allianceName: resolveName(lookup, entry.allianceId),
    battleCount: entry.battleCount,
  })),
  topCorporations: summary.topCorporations.map((entry) => ({
    corpId: entry.corpId.toString(),
    corpName: resolveName(lookup, entry.corpId),
    battleCount: entry.battleCount,
  })),
  generatedAt: formatDate(summary.generatedAt),
});
