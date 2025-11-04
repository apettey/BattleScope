import { deriveSpaceType } from '@battlescope/shared';
import type { DatabaseClient } from '../client.js';
import type {
  KillmailEventInsert,
  KillmailEventRecord,
  KillmailFeedItem,
  RulesetRecord,
  SpaceType,
} from '../types.js';
import { KillmailEventSchema, SpaceTypeSchema } from '../types.js';
import {
  serializeBigInt,
  serializeBigIntArray,
  serializeBigIntRequired,
  toBigInt,
  toBigIntArray,
} from './utils.js';

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgCode = (error as { code?: string }).code;
  if (pgCode === '23505') {
    return true;
  }

const message = (error as { message?: string }).message ?? '';
  return message.includes('duplicate key value');
};

interface FeedQueryOptions {
  limit: number;
  spaceTypes?: readonly SpaceType[];
  ruleset?: RulesetRecord;
  enforceTracked?: boolean;
}

interface FeedSinceOptions extends FeedQueryOptions {
  since?: Date;
  after?: { occurredAt: Date; killmailId: bigint };
}

const toParticipantCount = (event: {
  victimCharacterId: bigint | null;
  attackerCharacterIds: readonly bigint[];
}): number => {
  const victimCount = event.victimCharacterId ? 1 : 0;
  const attackers = event.attackerCharacterIds.length;
  const total = victimCount + attackers;
  return total > 0 ? total : 1;
};

const matchesRuleset = (
  item: KillmailFeedItem,
  ruleset: RulesetRecord | undefined,
  enforceTracked: boolean,
): boolean => {
  if (!ruleset) {
    return true;
  }

  if (ruleset.minPilots > item.participantCount) {
    return false;
  }

  const allianceSet = new Set(ruleset.trackedAllianceIds.map((id) => id.toString()));
  const corpSet = new Set(ruleset.trackedCorpIds.map((id) => id.toString()));

  const requireTracked =
    enforceTracked || (ruleset.ignoreUnlisted && (allianceSet.size > 0 || corpSet.size > 0));

  if (!requireTracked) {
    return true;
  }

  const allianceMatch =
    (item.victimAllianceId && allianceSet.has(item.victimAllianceId.toString())) ||
    item.attackerAllianceIds.some((id) => allianceSet.has(id.toString()));

  const corpMatch =
    (item.victimCorpId && corpSet.has(item.victimCorpId.toString())) ||
    item.attackerCorpIds.some((id) => corpSet.has(id.toString()));

  return allianceMatch || corpMatch;
};

export class KillmailRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insert(event: KillmailEventInsert): Promise<boolean> {
    const record = KillmailEventSchema.parse({
      ...event,
      fetchedAt: event.fetchedAt ?? new Date(),
    });

    try {
      await this.db
        .insertInto('killmail_events')
        .values({
          killmailId: serializeBigIntRequired(record.killmailId),
          systemId: serializeBigIntRequired(record.systemId),
          occurredAt: record.occurredAt,
          victimAllianceId: serializeBigInt(record.victimAllianceId),
          victimCorpId: serializeBigInt(record.victimCorpId),
          victimCharacterId: serializeBigInt(record.victimCharacterId),
          attackerAllianceIds: serializeBigIntArray(record.attackerAllianceIds),
          attackerCorpIds: serializeBigIntArray(record.attackerCorpIds),
          attackerCharacterIds: serializeBigIntArray(record.attackerCharacterIds),
          iskValue: serializeBigInt(record.iskValue),
          zkbUrl: record.zkbUrl,
          fetchedAt: record.fetchedAt,
        })
        .execute();
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async fetchUnprocessed(limit = 500): Promise<KillmailEventRecord[]> {
    const rows = await this.db
      .selectFrom('killmail_events')
      .selectAll()
      .where('processedAt', 'is', null)
      .orderBy('occurredAt', 'asc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...row,
      killmailId: toBigInt(row.killmailId) ?? 0n,
      systemId: toBigInt(row.systemId) ?? 0n,
      victimAllianceId: toBigInt(row.victimAllianceId),
      victimCorpId: toBigInt(row.victimCorpId),
      victimCharacterId: toBigInt(row.victimCharacterId),
      attackerAllianceIds: row.attackerAllianceIds ? toBigIntArray(row.attackerAllianceIds) : [],
      attackerCorpIds: row.attackerCorpIds ? toBigIntArray(row.attackerCorpIds) : [],
      attackerCharacterIds: row.attackerCharacterIds ? toBigIntArray(row.attackerCharacterIds) : [],
      iskValue: toBigInt(row.iskValue),
    }));
  }

  async markAsProcessed(
    killmailIds: readonly bigint[],
    battleId: string | null,
    processedAt = new Date(),
  ): Promise<void> {
    if (killmailIds.length === 0) {
      return;
    }

    await this.db
      .updateTable('killmail_events')
      .set({
        battleId,
        processedAt,
      })
      .where(
        'killmailId',
        'in',
        killmailIds.map((id) => serializeBigIntRequired(id)),
      )
      .execute();
  }

  private toFeedItem(row: {
    killmailId: unknown;
    systemId: unknown;
    occurredAt: Date;
    victimAllianceId: unknown;
    victimCorpId: unknown;
    victimCharacterId: unknown;
    attackerAllianceIds: readonly (bigint | number | string | null | undefined)[] | null;
    attackerCorpIds: readonly (bigint | number | string | null | undefined)[] | null;
    attackerCharacterIds: readonly (bigint | number | string | null | undefined)[] | null;
    iskValue: unknown;
    zkbUrl: string;
    battleId: string | null;
  }): KillmailFeedItem {
    const killmailId = toBigInt(row.killmailId) ?? 0n;
    const systemId = toBigInt(row.systemId) ?? 0n;
    const attackerAllianceIds = row.attackerAllianceIds
      ? toBigIntArray(row.attackerAllianceIds)
      : [];
    const attackerCorpIds = row.attackerCorpIds ? toBigIntArray(row.attackerCorpIds) : [];
    const attackerCharacterIds = row.attackerCharacterIds
      ? toBigIntArray(row.attackerCharacterIds)
      : [];

    const victimAllianceId = toBigInt(row.victimAllianceId);
    const victimCorpId = toBigInt(row.victimCorpId);
    const victimCharacterId = toBigInt(row.victimCharacterId);

    const participantCount = toParticipantCount({
      victimCharacterId,
      attackerCharacterIds,
    });

    return {
      killmailId,
      systemId,
      occurredAt: row.occurredAt,
      spaceType: deriveSpaceType(systemId),
      victimAllianceId,
      victimCorpId,
      victimCharacterId,
      attackerAllianceIds,
      attackerCorpIds,
      attackerCharacterIds,
      iskValue: toBigInt(row.iskValue),
      zkbUrl: row.zkbUrl,
      battleId: row.battleId ?? null,
      participantCount,
    };
  }

  private filterFeedItems(
    items: KillmailFeedItem[],
    { spaceTypes, ruleset, enforceTracked }: FeedQueryOptions,
  ): KillmailFeedItem[] {
    const spaceTypeSet =
      spaceTypes && spaceTypes.length > 0
        ? new Set(spaceTypes.map((value) => SpaceTypeSchema.parse(value)))
        : null;

    return items.filter((item) => {
      if (spaceTypeSet && !spaceTypeSet.has(item.spaceType)) {
        return false;
      }

      if (!matchesRuleset(item, ruleset, enforceTracked ?? false)) {
        return false;
      }

      return true;
    });
  }

  async fetchRecentFeed(options: FeedQueryOptions): Promise<KillmailFeedItem[]> {
    const limit = options.limit;
    const rows = await this.db
      .selectFrom('killmail_events')
      .select([
        'killmailId',
        'systemId',
        'occurredAt',
        'victimAllianceId',
        'victimCorpId',
        'victimCharacterId',
        'attackerAllianceIds',
        'attackerCorpIds',
        'attackerCharacterIds',
        'iskValue',
        'zkbUrl',
        'battleId',
      ])
      .orderBy('occurredAt', 'desc')
      .orderBy('killmailId', 'desc')
      .limit(limit * 3)
      .execute();

    const items = rows.map((row) => this.toFeedItem(row));
    const filtered = this.filterFeedItems(items, options);
    return filtered.slice(0, limit);
  }

  async fetchFeedSince(options: FeedSinceOptions): Promise<KillmailFeedItem[]> {
    const limit = options.limit;
    let query = this.db
      .selectFrom('killmail_events')
      .select([
        'killmailId',
        'systemId',
        'occurredAt',
        'victimAllianceId',
        'victimCorpId',
        'victimCharacterId',
        'attackerAllianceIds',
        'attackerCorpIds',
        'attackerCharacterIds',
        'iskValue',
        'zkbUrl',
        'battleId',
      ]);

    if (options.after) {
      query = query.where((eb) =>
        eb.or([
          eb('occurredAt', '>', options.after.occurredAt),
          eb.and([
            eb('occurredAt', '=', options.after.occurredAt),
            eb('killmailId', '>', serializeBigIntRequired(options.after.killmailId)),
          ]),
        ]),
      );
    } else if (options.since) {
      query = query.where('occurredAt', '>', options.since);
    }

    const rows = await query
      .orderBy('occurredAt', 'asc')
      .orderBy('killmailId', 'asc')
      .limit(limit * 3)
      .execute();

    const items = rows.map((row) => this.toFeedItem(row));
    const filtered = this.filterFeedItems(items, options);
    return filtered.slice(0, limit);
  }
}
