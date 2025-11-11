import type {
  BattleInsert,
  BattleKillmailInsert,
  BattleParticipantInsert,
  KillmailEventRecord,
} from '@battlescope/database';
import { buildZKillRelatedUrl, deriveSecurityType } from '@battlescope/shared';
import { randomUUID } from 'crypto';

export interface ClusteringParameters {
  windowMinutes: number;
  gapMaxMinutes: number;
  minKills: number;
}

export interface BattlePlan {
  battle: BattleInsert;
  killmailInserts: BattleKillmailInsert[];
  killmailIds: bigint[];
  participantInserts: BattleParticipantInsert[];
}

export interface ClusterResult {
  battles: BattlePlan[];
  ignoredKillmailIds: bigint[];
}

interface ClusterAccumulator {
  systemId: bigint;
  killmails: KillmailEventRecord[];
  allianceIds: Set<bigint>;
}

const minutesToMs = (minutes: number) => minutes * 60 * 1000;

const getAllianceIds = (killmail: KillmailEventRecord): bigint[] => {
  const ids = new Set<bigint>();
  if (killmail.victimAllianceId) {
    ids.add(killmail.victimAllianceId);
  }
  for (const id of killmail.attackerAllianceIds ?? []) {
    ids.add(id);
  }
  return Array.from(ids);
};

const sumIsk = (killmails: KillmailEventRecord[]): bigint =>
  killmails.reduce((total, killmail) => total + (killmail.iskValue ?? 0n), 0n);

const extractParticipants = (
  battleId: string,
  killmails: KillmailEventRecord[],
): BattleParticipantInsert[] => {
  // Use a Map to deduplicate participants by characterId + shipTypeId
  // Key format: "characterId:shipTypeId"
  const participantMap = new Map<string, BattleParticipantInsert>();

  for (const killmail of killmails) {
    // Add victim as participant
    if (killmail.victimCharacterId) {
      const key = `${killmail.victimCharacterId}:${killmail.victimCharacterId}`; // Victims don't have shipTypeId in events
      if (!participantMap.has(key)) {
        participantMap.set(key, {
          battleId,
          characterId: killmail.victimCharacterId,
          allianceId: killmail.victimAllianceId,
          corpId: killmail.victimCorpId,
          shipTypeId: null, // We don't have ship type for victims in the killmail_events table
          sideId: null,
          isVictim: true,
        });
      }
    }

    // Add attackers as participants
    const attackerCount = killmail.attackerCharacterIds?.length ?? 0;
    for (let i = 0; i < attackerCount; i++) {
      const characterId = killmail.attackerCharacterIds[i];
      const corpId = killmail.attackerCorpIds?.[i] ?? null;
      const allianceId = killmail.attackerAllianceIds?.[i] ?? null;

      const key = `${characterId}:${characterId}`; // Attackers also don't have shipTypeId in events
      if (!participantMap.has(key)) {
        participantMap.set(key, {
          battleId,
          characterId,
          allianceId,
          corpId,
          shipTypeId: null,
          sideId: null,
          isVictim: false,
        });
      }
    }
  }

  return Array.from(participantMap.values());
};

const toBattlePlan = (systemId: bigint, killmails: KillmailEventRecord[]): BattlePlan => {
  const sorted = [...killmails].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const startTime = sorted[0].occurredAt;
  const endTime = sorted[sorted.length - 1].occurredAt;
  const battleId = randomUUID();

  const battle: BattleInsert = {
    id: battleId,
    systemId,
    securityType: deriveSecurityType(systemId),
    startTime,
    endTime,
    totalKills: BigInt(sorted.length),
    totalIskDestroyed: sumIsk(sorted),
    zkillRelatedUrl: buildZKillRelatedUrl(systemId, startTime),
  };

  const killmailInserts: BattleKillmailInsert[] = sorted.map((killmail) => ({
    battleId,
    killmailId: killmail.killmailId,
    zkbUrl: killmail.zkbUrl,
    occurredAt: killmail.occurredAt,
    victimAllianceId: killmail.victimAllianceId,
    attackerAllianceIds: killmail.attackerAllianceIds,
    iskValue: killmail.iskValue,
    sideId: null,
  }));

  return {
    battle,
    killmailInserts,
    killmailIds: killmails.map((km) => km.killmailId),
  };
};

export class ClusteringEngine {
  private readonly windowMs: number;
  private readonly gapMs: number;

  constructor(private readonly params: ClusteringParameters) {
    this.windowMs = minutesToMs(params.windowMinutes);
    this.gapMs = minutesToMs(params.gapMaxMinutes);
  }

  cluster(killmails: KillmailEventRecord[]): ClusterResult {
    if (killmails.length === 0) {
      return { battles: [], ignoredKillmailIds: [] };
    }

    const grouped = new Map<bigint, KillmailEventRecord[]>();
    for (const killmail of killmails) {
      const group = grouped.get(killmail.systemId) ?? [];
      group.push(killmail);
      grouped.set(killmail.systemId, group);
    }

    const battles: BattlePlan[] = [];
    const ignoredKillmailIds: bigint[] = [];

    for (const [systemId, events] of grouped.entries()) {
      events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      let cluster: ClusterAccumulator | undefined;

      const flushCluster = () => {
        if (!cluster) {
          return;
        }
        if (cluster.killmails.length >= this.params.minKills) {
          battles.push(toBattlePlan(systemId, cluster.killmails));
        } else {
          ignoredKillmailIds.push(...cluster.killmails.map((km) => km.killmailId));
        }
        cluster = undefined;
      };

      for (const killmail of events) {
        if (!cluster) {
          cluster = {
            systemId,
            killmails: [killmail],
            allianceIds: new Set(getAllianceIds(killmail)),
          };
          continue;
        }

        const last = cluster.killmails[cluster.killmails.length - 1];
        const gap = killmail.occurredAt.getTime() - last.occurredAt.getTime();
        const window = killmail.occurredAt.getTime() - cluster.killmails[0].occurredAt.getTime();
        const alliances = getAllianceIds(killmail);
        const correlated = alliances.some((id) => cluster!.allianceIds.has(id));

        const contiguous = gap <= this.gapMs;
        const withinWindow = window <= this.windowMs;

        if ((contiguous || correlated) && withinWindow) {
          cluster.killmails.push(killmail);
          alliances.forEach((id) => cluster!.allianceIds.add(id));
        } else {
          flushCluster();
          cluster = {
            systemId,
            killmails: [killmail],
            allianceIds: new Set(alliances),
          };
        }
      }

      flushCluster();
    }

    return { battles, ignoredKillmailIds };
  }
}
