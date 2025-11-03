import type {
  BattleRecord,
  BattleWithDetails,
  BattleKillmailRecord,
  BattleParticipantRecord,
} from '@battlescope/database';

const formatBigInt = (value: bigint | null): string | null =>
  value === null ? null : value.toString();

const formatDate = (value: Date): string => value.toISOString();

export interface BattleSummaryResponse {
  id: string;
  systemId: number;
  spaceType: string;
  startTime: string;
  endTime: string;
  totalKills: number;
  totalIskDestroyed: string;
  zkillRelatedUrl: string;
}

export interface BattleDetailResponse extends BattleSummaryResponse {
  createdAt: string;
  killmails: Array<{
    killmailId: number;
    occurredAt: string;
    victimAllianceId: number | null;
    victimCorpId: number | null;
    victimCharacterId: string | null;
    attackerAllianceIds: number[];
    attackerCorpIds: number[];
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
  participants: Array<BattleParticipantRecord>;
}

const toKillmailResponse = (killmail: BattleKillmailRecord) => ({
  killmailId: killmail.killmailId,
  occurredAt: formatDate(killmail.occurredAt),
  victimAllianceId: killmail.victimAllianceId ?? null,
  victimCorpId: killmail.victimCorpId ?? null,
  victimCharacterId: formatBigInt(killmail.victimCharacterId ?? null),
  attackerAllianceIds: killmail.attackerAllianceIds,
  attackerCorpIds: killmail.attackerCorpIds ?? [],
  attackerCharacterIds: (killmail.attackerCharacterIds ?? []).map((id) => id.toString()),
  iskValue: formatBigInt(killmail.iskValue ?? null),
  zkbUrl: killmail.zkbUrl,
  enrichment: killmail.enrichment
    ? {
        status: killmail.enrichment.status,
        payload: killmail.enrichment.payload ?? null,
        error: killmail.enrichment.error ?? null,
        fetchedAt: killmail.enrichment.fetchedAt
          ? formatDate(killmail.enrichment.fetchedAt)
          : null,
        updatedAt: formatDate(killmail.enrichment.updatedAt),
        createdAt: formatDate(killmail.enrichment.createdAt),
      }
    : null,
});

export const toBattleSummaryResponse = (battle: BattleRecord): BattleSummaryResponse => ({
  id: battle.id,
  systemId: battle.systemId,
  spaceType: battle.spaceType,
  startTime: formatDate(battle.startTime),
  endTime: formatDate(battle.endTime),
  totalKills: battle.totalKills,
  totalIskDestroyed: battle.totalIskDestroyed.toString(),
  zkillRelatedUrl: battle.zkillRelatedUrl,
});

export const toBattleDetailResponse = (battle: BattleWithDetails): BattleDetailResponse => ({
  ...toBattleSummaryResponse(battle),
  createdAt: formatDate(battle.createdAt),
  killmails: battle.killmails.map(toKillmailResponse),
  participants: battle.participants,
});
