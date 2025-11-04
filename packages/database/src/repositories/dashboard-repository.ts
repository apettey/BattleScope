import type { DatabaseClient } from '../client.js';
import type { DashboardSummary } from '../types.js';
import { toBigInt, toBigIntArray } from './utils.js';

const toCount = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number.parseInt(value, 10);
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return 0;
};

export class DashboardRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getSummary(limit = 5): Promise<DashboardSummary> {
    const [battleCountRow] = await this.db
      .selectFrom('battles')
      .select((eb) => eb.fn.countAll().as('count'))
      .execute();

    const [killmailCountRow] = await this.db
      .selectFrom('killmail_events')
      .select((eb) => eb.fn.countAll().as('count'))
      .execute();

    const events = await this.db
      .selectFrom('killmail_events')
      .select([
        'battleId',
        'victimAllianceId',
        'victimCorpId',
        'attackerAllianceIds',
        'attackerCorpIds',
      ])
      .where('battleId', 'is not', null)
      .execute();

    const allianceBattles = new Map<bigint, Set<string>>();
    const corpBattles = new Map<bigint, Set<string>>();

    for (const event of events) {
      const battleId = event.battleId as string | null;
      if (!battleId) {
        continue;
      }

      const alliances = new Set<bigint>();
      const victimAlliance = toBigInt(event.victimAllianceId);
      if (victimAlliance !== null) {
        alliances.add(victimAlliance);
      }
      toBigIntArray(event.attackerAllianceIds ?? []).forEach((id) => alliances.add(id));
      alliances.forEach((id) => {
        if (!allianceBattles.has(id)) {
          allianceBattles.set(id, new Set());
        }
        allianceBattles.get(id)!.add(battleId);
      });

      const corps = new Set<bigint>();
      const victimCorp = toBigInt(event.victimCorpId);
      if (victimCorp !== null) {
        corps.add(victimCorp);
      }
      toBigIntArray(event.attackerCorpIds ?? []).forEach((id) => corps.add(id));
      corps.forEach((id) => {
        if (!corpBattles.has(id)) {
          corpBattles.set(id, new Set());
        }
        corpBattles.get(id)!.add(battleId);
      });
    }

    const toSortedTop = <T extends bigint>(
      map: Map<T, Set<string>>,
    ): Array<{ id: T; battleCount: number }> =>
      Array.from(map.entries())
        .map(([id, battles]) => ({ id, battleCount: battles.size }))
        .sort((a, b) => {
          if (b.battleCount !== a.battleCount) {
            return b.battleCount - a.battleCount;
          }
          return a.id < b.id ? -1 : 1;
        })
        .slice(0, limit);

    const topAlliances = toSortedTop(allianceBattles);
    const topCorporations = toSortedTop(corpBattles);

    return {
      totalBattles: toCount(battleCountRow?.count),
      totalKillmails: toCount(killmailCountRow?.count),
      uniqueAlliances: allianceBattles.size,
      uniqueCorporations: corpBattles.size,
      topAlliances: topAlliances
        .filter((entry) => entry.id !== 0n)
        .map((entry) => ({ allianceId: entry.id, battleCount: entry.battleCount })),
      topCorporations: topCorporations
        .filter((entry) => entry.id !== 0n)
        .map((entry) => ({ corpId: entry.id, battleCount: entry.battleCount })),
      generatedAt: new Date(),
    };
  }
}
