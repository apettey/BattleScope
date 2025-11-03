import type {
  BattleRecord,
  BattleWithDetails,
  BattleKillmailRecord,
  BattleParticipantRecord,
} from '@battlescope/database';

const formatBigInt = (value: bigint | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toString();

const formatDate = (value: Date): string => value.toISOString();

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
