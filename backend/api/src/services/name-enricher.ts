import type {
  BattleRecord,
  BattleWithDetails,
  DashboardSummary,
  KillmailFeedItem,
  RulesetRecord,
} from '@battlescope/database';
import type { EsiClient } from '@battlescope/esi-client';
import {
  toBattleDetailResponse,
  toBattleSummaryResponse,
  toDashboardSummaryResponse,
  toKillmailFeedItemResponse,
  toRulesetResponse,
  type BattleDetailResponse,
  type BattleSummaryResponse,
  type DashboardSummaryResponse,
  type KillmailFeedItemResponse,
  type NameLookup,
  type RulesetResponse,
} from '../types.js';

type IdValue = bigint | number | string | null | undefined;

const toNumericId = (value: IdValue): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
};

const addId = (ids: Set<number>, value: IdValue): void => {
  const numeric = toNumericId(value);
  if (numeric !== null) {
    ids.add(numeric);
  }
};

const addMany = (
  ids: Set<number>,
  values: readonly (bigint | number)[] | null | undefined,
): void => {
  if (!values) {
    return;
  }
  for (const value of values) {
    addId(ids, value);
  }
};

const buildLookup = async (client: EsiClient, ids: Set<number>): Promise<NameLookup> => {
  if (ids.size === 0) {
    return new Map();
  }

  const response = await client.getUniverseNames(Array.from(ids));
  const lookup: NameLookup = new Map();
  for (const entry of response.values()) {
    lookup.set(entry.id.toString(), entry.name);
  }
  return lookup;
};

const collectBattleRecordIds = (battle: BattleRecord): Set<number> => {
  const ids = new Set<number>();
  addId(ids, battle.systemId);
  return ids;
};

const collectBattleDetailIds = (battle: BattleWithDetails): Set<number> => {
  const ids = collectBattleRecordIds(battle);

  for (const killmail of battle.killmails) {
    addId(ids, killmail.victimAllianceId);
    addId(ids, killmail.victimCorpId);
    addId(ids, killmail.victimCharacterId);
    addMany(ids, killmail.attackerAllianceIds);
    addMany(ids, killmail.attackerCorpIds);
    addMany(ids, killmail.attackerCharacterIds);
  }

  for (const participant of battle.participants) {
    addId(ids, participant.characterId);
    addId(ids, participant.allianceId);
    addId(ids, participant.corpId);
    addId(ids, participant.shipTypeId);
  }

  return ids;
};

const collectKillmailFeedIds = (items: readonly KillmailFeedItem[]): Set<number> => {
  const ids = new Set<number>();
  for (const item of items) {
    addId(ids, item.systemId);
    addId(ids, item.victimAllianceId);
    addId(ids, item.victimCorpId);
    addId(ids, item.victimCharacterId);
    addMany(ids, item.attackerAllianceIds);
    addMany(ids, item.attackerCorpIds);
    addMany(ids, item.attackerCharacterIds);
  }
  return ids;
};

const collectRulesetIds = (ruleset: RulesetRecord): Set<number> => {
  const ids = new Set<number>();
  addMany(ids, ruleset.trackedAllianceIds);
  addMany(ids, ruleset.trackedCorpIds);
  return ids;
};

const collectDashboardIds = (summary: DashboardSummary): Set<number> => {
  const ids = new Set<number>();
  for (const entry of summary.topAlliances) {
    addId(ids, entry.allianceId);
  }
  for (const entry of summary.topCorporations) {
    addId(ids, entry.corpId);
  }
  return ids;
};

export class NameEnricher {
  constructor(private readonly esiClient: EsiClient) {}

  async enrichBattleSummaries(battles: readonly BattleRecord[]): Promise<BattleSummaryResponse[]> {
    const ids = new Set<number>();
    for (const battle of battles) {
      for (const value of collectBattleRecordIds(battle)) {
        ids.add(value);
      }
    }
    const lookup = await buildLookup(this.esiClient, ids);
    return battles.map((battle) => toBattleSummaryResponse(battle, lookup));
  }

  async enrichBattleDetail(battle: BattleWithDetails): Promise<BattleDetailResponse> {
    const ids = collectBattleDetailIds(battle);
    const lookup = await buildLookup(this.esiClient, ids);
    return toBattleDetailResponse(battle, lookup);
  }

  async enrichKillmailFeed(
    items: readonly KillmailFeedItem[],
  ): Promise<KillmailFeedItemResponse[]> {
    const ids = collectKillmailFeedIds(items);
    const lookup = await buildLookup(this.esiClient, ids);
    return items.map((item) => toKillmailFeedItemResponse(item, lookup));
  }

  async enrichRuleset(ruleset: RulesetRecord): Promise<RulesetResponse> {
    const ids = collectRulesetIds(ruleset);
    const lookup = await buildLookup(this.esiClient, ids);
    return toRulesetResponse(ruleset, lookup);
  }

  async enrichDashboardSummary(summary: DashboardSummary): Promise<DashboardSummaryResponse> {
    const ids = collectDashboardIds(summary);
    const lookup = await buildLookup(this.esiClient, ids);
    return toDashboardSummaryResponse(summary, lookup);
  }

  async lookupNames(ids: number[]): Promise<NameLookup> {
    const idSet = new Set<number>();
    for (const id of ids) {
      if (Number.isSafeInteger(id) && id > 0) {
        idSet.add(id);
      }
    }
    return buildLookup(this.esiClient, idSet);
  }
}
