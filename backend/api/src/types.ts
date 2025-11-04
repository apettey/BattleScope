import type {
  BattleRecord,
  BattleWithDetails,
  BattleKillmailRecord,
  BattleParticipantRecord,
  RulesetRecord,
  KillmailFeedItem,
  DashboardSummary,
} from '@battlescope/database';

const formatBigInt = (value: bigint | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toString();

const formatDate = (value: Date): string => value.toISOString();

const formatBigIntArray = (values: readonly bigint[]): string[] => values.map((value) => value.toString());

export interface BattleSummaryResponse {
  id: string;
  systemId: string;
  spaceType: string;
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
    victimCorpId: string | null;
    victimCharacterId: string | null;
    attackerAllianceIds: string[];
    attackerCorpIds: string[];
    attackerCharacterIds: string[];
    iskValue: string | null;
    zkbUrl: string;
    enrichment: {
      status: string;
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
    allianceId: string | null;
    corpId: string | null;
    shipTypeId: string | null;
    sideId: string | null;
    isVictim: boolean;
  }>;
}

const toKillmailResponse = (killmail: BattleKillmailRecord) => ({
  killmailId: killmail.killmailId.toString(),
  occurredAt: formatDate(killmail.occurredAt),
  victimAllianceId: formatBigInt(killmail.victimAllianceId),
  victimCorpId: formatBigInt(killmail.victimCorpId),
  victimCharacterId: formatBigInt(killmail.victimCharacterId),
  attackerAllianceIds: (killmail.attackerAllianceIds ?? []).map((id) => id.toString()),
  attackerCorpIds: (killmail.attackerCorpIds ?? []).map((id) => id.toString()),
  attackerCharacterIds: (killmail.attackerCharacterIds ?? []).map((id) => id.toString()),
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

export const toBattleSummaryResponse = (battle: BattleRecord): BattleSummaryResponse => ({
  id: battle.id,
  systemId: battle.systemId.toString(),
  spaceType: battle.spaceType,
  startTime: formatDate(battle.startTime),
  endTime: formatDate(battle.endTime),
  totalKills: battle.totalKills.toString(),
  totalIskDestroyed: battle.totalIskDestroyed.toString(),
  zkillRelatedUrl: battle.zkillRelatedUrl,
});

export const toBattleDetailResponse = (battle: BattleWithDetails): BattleDetailResponse => ({
  ...toBattleSummaryResponse(battle),
  createdAt: formatDate(battle.createdAt),
  killmails: battle.killmails.map(toKillmailResponse),
  participants: battle.participants.map((participant: BattleParticipantRecord) => ({
    battleId: participant.battleId,
    characterId: participant.characterId.toString(),
    allianceId: formatBigInt(participant.allianceId),
    corpId: formatBigInt(participant.corpId),
    shipTypeId: formatBigInt(participant.shipTypeId),
    sideId: formatBigInt(participant.sideId),
    isVictim: participant.isVictim,
  })),
});

export interface RulesetResponse {
  id: string;
  minPilots: number;
  trackedAllianceIds: string[];
  trackedCorpIds: string[];
  ignoreUnlisted: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const toRulesetResponse = (ruleset: RulesetRecord): RulesetResponse => ({
  id: ruleset.id,
  minPilots: ruleset.minPilots,
  trackedAllianceIds: formatBigIntArray(ruleset.trackedAllianceIds),
  trackedCorpIds: formatBigIntArray(ruleset.trackedCorpIds),
  ignoreUnlisted: ruleset.ignoreUnlisted,
  updatedBy: ruleset.updatedBy ?? null,
  createdAt: formatDate(ruleset.createdAt),
  updatedAt: formatDate(ruleset.updatedAt),
});

export interface KillmailFeedItemResponse {
  killmailId: string;
  systemId: string;
  occurredAt: string;
  spaceType: string;
  victimAllianceId: string | null;
  victimCorpId: string | null;
  victimCharacterId: string | null;
  attackerAllianceIds: string[];
  attackerCorpIds: string[];
  attackerCharacterIds: string[];
  iskValue: string | null;
  zkbUrl: string;
  battleId: string | null;
  participantCount: number;
}

export const toKillmailFeedItemResponse = (
  item: KillmailFeedItem,
): KillmailFeedItemResponse => ({
  killmailId: item.killmailId.toString(),
  systemId: item.systemId.toString(),
  occurredAt: formatDate(item.occurredAt),
  spaceType: item.spaceType,
  victimAllianceId: formatBigInt(item.victimAllianceId),
  victimCorpId: formatBigInt(item.victimCorpId),
  victimCharacterId: formatBigInt(item.victimCharacterId),
  attackerAllianceIds: formatBigIntArray(item.attackerAllianceIds),
  attackerCorpIds: formatBigIntArray(item.attackerCorpIds),
  attackerCharacterIds: formatBigIntArray(item.attackerCharacterIds),
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
  topAlliances: Array<{ allianceId: string; battleCount: number }>;
  topCorporations: Array<{ corpId: string; battleCount: number }>;
  generatedAt: string;
}

export const toDashboardSummaryResponse = (
  summary: DashboardSummary,
): DashboardSummaryResponse => ({
  totalBattles: summary.totalBattles,
  totalKillmails: summary.totalKillmails,
  uniqueAlliances: summary.uniqueAlliances,
  uniqueCorporations: summary.uniqueCorporations,
  topAlliances: summary.topAlliances.map((entry) => ({
    allianceId: entry.allianceId.toString(),
    battleCount: entry.battleCount,
  })),
  topCorporations: summary.topCorporations.map((entry) => ({
    corpId: entry.corpId.toString(),
    battleCount: entry.battleCount,
  })),
  generatedAt: formatDate(summary.generatedAt),
});
