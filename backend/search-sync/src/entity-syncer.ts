import type { DatabaseClient } from '@battlescope/database';
import { createEsiClient, type EsiClient } from '@battlescope/esi-client';
import { calculateEntityActivityScore } from '@battlescope/search';
import { sql } from 'kysely';
import type Typesense from 'typesense';
import type { Logger } from 'pino';

interface EntityDocument {
  id: string;
  type: 'alliance' | 'corporation' | 'character';
  name: string;
  ticker?: string;
  allianceId?: string;
  allianceName?: string;
  corpId?: string;
  corpName?: string;
  battleCount: number;
  lastSeenAt: number;
  activityScore: number;
}

export class EntitySyncer {
  private readonly esiClient: EsiClient;

  constructor(
    private readonly db: DatabaseClient,
    private readonly typesenseClient: Typesense.Client,
    private readonly logger: Logger,
  ) {
    // Create ESI client with 30-minute cache TTL
    this.esiClient = createEsiClient({
      cacheTtlMs: 30 * 60 * 1000, // 30 minutes
    });
  }

  async syncAllEntities(): Promise<void> {
    this.logger.info('Starting entity sync to Typesense');

    try {
      // First check if there's any data in the database
      const battleCount = await this.db
        .selectFrom('battles')
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst();

      const participantCount = await this.db
        .selectFrom('battle_participants')
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst();

      this.logger.info(
        {
          battles: Number(battleCount?.count ?? 0),
          participants: Number(participantCount?.count ?? 0),
        },
        'Database statistics',
      );

      await this.syncAlliances();
      await this.syncCorporations();
      await this.syncCharacters();

      this.logger.info('Entity sync completed successfully');
    } catch (error) {
      this.logger.error({ error }, 'Entity sync failed');
      throw error;
    }
  }

  private async syncAlliances(): Promise<void> {
    this.logger.info('Syncing alliances...');

    // Get all unique alliance IDs from battle_participants
    const results = await this.db
      .selectFrom('battle_participants as bp')
      .innerJoin('battles as b', 'bp.battleId', 'b.id')
      .select((eb) => [
        sql<string>`CAST(bp.alliance_id AS TEXT)`.as('allianceId'),
        eb.fn.countAll<string>().as('battleCount'),
        eb.fn.max('b.startTime').as('lastSeenAt'),
      ])
      .where('bp.allianceId', 'is not', null)
      .groupBy('bp.allianceId')
      .execute();

    this.logger.info({ count: results.length }, 'Found alliances to sync');

    if (results.length > 0) {
      this.logger.info(
        { sampleIds: results.slice(0, 5).map((r) => r.allianceId) },
        'Sample alliance IDs from query',
      );
    }

    // Get names for all alliances
    const allianceIds = results.map((r) => r.allianceId).filter((id): id is string => id !== null);
    const nameMap = await this.getEntityNames(allianceIds);

    // Build documents
    const documents: EntityDocument[] = results
      .filter((r) => r.allianceId !== null)
      .map((result) => {
        const id = result.allianceId!;
        const battleCount = Number(result.battleCount);
        const lastSeenAt = result.lastSeenAt ? new Date(result.lastSeenAt) : new Date();
        const nameInfo = nameMap.get(id);

        return {
          id,
          type: 'alliance' as const,
          name: nameInfo?.name ?? `Alliance ${id}`,
          ticker: nameInfo?.ticker,
          battleCount,
          lastSeenAt: Math.floor(lastSeenAt.getTime() / 1000),
          activityScore: calculateEntityActivityScore(battleCount, lastSeenAt),
        };
      });

    if (documents.length > 0) {
      this.logger.info(
        {
          count: documents.length,
          sample: documents.slice(0, 3).map((d) => ({
            id: d.id,
            name: d.name,
            battleCount: d.battleCount,
          })),
        },
        'Alliance documents prepared for indexing',
      );
    }

    await this.importDocuments(documents, 'alliances');
    this.logger.info({ count: documents.length }, 'Alliances synced');
  }

  private async syncCorporations(): Promise<void> {
    this.logger.info('Syncing corporations...');

    // Get all unique corporation IDs from battle_participants
    const results = await this.db
      .selectFrom('battle_participants as bp')
      .innerJoin('battles as b', 'bp.battleId', 'b.id')
      .select((eb) => [
        sql<string>`CAST(bp.corp_id AS TEXT)`.as('corpId'),
        sql<string>`CAST(bp.alliance_id AS TEXT)`.as('allianceId'),
        eb.fn.countAll<string>().as('battleCount'),
        eb.fn.max('b.startTime').as('lastSeenAt'),
      ])
      .where('bp.corpId', 'is not', null)
      .groupBy(['bp.corpId', 'bp.allianceId'])
      .execute();

    this.logger.info({ count: results.length }, 'Found corporations to sync');

    if (results.length > 0) {
      this.logger.info(
        { sampleIds: results.slice(0, 5).map((r) => r.corpId) },
        'Sample corporation IDs from query',
      );
    }

    // Get names for corporations and their alliances
    const entityIds = new Set<string>();
    results.forEach((r) => {
      if (r.corpId) entityIds.add(r.corpId);
      if (r.allianceId) entityIds.add(r.allianceId);
    });
    const nameMap = await this.getEntityNames(Array.from(entityIds));

    // Build documents
    const documents: EntityDocument[] = results
      .filter((r) => r.corpId !== null)
      .map((result) => {
        const id = result.corpId!;
        const battleCount = Number(result.battleCount);
        const lastSeenAt = result.lastSeenAt ? new Date(result.lastSeenAt) : new Date();
        const nameInfo = nameMap.get(id);
        const allianceInfo = result.allianceId ? nameMap.get(result.allianceId) : undefined;

        return {
          id,
          type: 'corporation' as const,
          name: nameInfo?.name ?? `Corporation ${id}`,
          ticker: nameInfo?.ticker,
          allianceId: result.allianceId ?? undefined,
          allianceName: allianceInfo?.name,
          battleCount,
          lastSeenAt: Math.floor(lastSeenAt.getTime() / 1000),
          activityScore: calculateEntityActivityScore(battleCount, lastSeenAt),
        };
      });

    if (documents.length > 0) {
      this.logger.info(
        {
          count: documents.length,
          sample: documents.slice(0, 3).map((d) => ({
            id: d.id,
            name: d.name,
            allianceId: d.allianceId,
            battleCount: d.battleCount,
          })),
        },
        'Corporation documents prepared for indexing',
      );
    }

    await this.importDocuments(documents, 'corporations');
    this.logger.info({ count: documents.length }, 'Corporations synced');
  }

  private async syncCharacters(): Promise<void> {
    this.logger.info('Syncing characters...');

    // Get all unique character IDs from battle_participants
    const results = await this.db
      .selectFrom('battle_participants as bp')
      .innerJoin('battles as b', 'bp.battleId', 'b.id')
      .select((eb) => [
        sql<string>`CAST(bp.character_id AS TEXT)`.as('characterId'),
        sql<string>`CAST(bp.corp_id AS TEXT)`.as('corpId'),
        sql<string>`CAST(bp.alliance_id AS TEXT)`.as('allianceId'),
        eb.fn.countAll<string>().as('battleCount'),
        eb.fn.max('b.startTime').as('lastSeenAt'),
      ])
      .where('bp.characterId', 'is not', null)
      .groupBy(['bp.characterId', 'bp.corpId', 'bp.allianceId'])
      .execute();

    this.logger.info({ count: results.length }, 'Found characters to sync');

    if (results.length > 0) {
      this.logger.info(
        { sampleIds: results.slice(0, 5).map((r) => r.characterId) },
        'Sample character IDs from query',
      );
    }

    // Get names for characters, corporations, and alliances
    const entityIds = new Set<string>();
    results.forEach((r) => {
      if (r.characterId) entityIds.add(r.characterId);
      if (r.corpId) entityIds.add(r.corpId);
      if (r.allianceId) entityIds.add(r.allianceId);
    });
    const nameMap = await this.getEntityNames(Array.from(entityIds));

    // Build documents
    const documents: EntityDocument[] = results
      .filter((r) => r.characterId !== null)
      .map((result) => {
        const id = result.characterId!;
        const battleCount = Number(result.battleCount);
        const lastSeenAt = result.lastSeenAt ? new Date(result.lastSeenAt) : new Date();
        const nameInfo = nameMap.get(id);
        const corpInfo = result.corpId ? nameMap.get(result.corpId) : undefined;
        const allianceInfo = result.allianceId ? nameMap.get(result.allianceId) : undefined;

        return {
          id,
          type: 'character' as const,
          name: nameInfo?.name ?? `Character ${id}`,
          corpId: result.corpId ?? undefined,
          corpName: corpInfo?.name,
          allianceId: result.allianceId ?? undefined,
          allianceName: allianceInfo?.name,
          battleCount,
          lastSeenAt: Math.floor(lastSeenAt.getTime() / 1000),
          activityScore: calculateEntityActivityScore(battleCount, lastSeenAt),
        };
      });

    if (documents.length > 0) {
      this.logger.info(
        {
          count: documents.length,
          sample: documents.slice(0, 3).map((d) => ({
            id: d.id,
            name: d.name,
            corpId: d.corpId,
            allianceId: d.allianceId,
            battleCount: d.battleCount,
          })),
        },
        'Character documents prepared for indexing',
      );
    }

    await this.importDocuments(documents, 'characters');
    this.logger.info({ count: documents.length }, 'Characters synced');
  }

  private async getEntityNames(
    ids: string[],
  ): Promise<Map<string, { name: string; ticker?: string }>> {
    if (ids.length === 0) {
      return new Map();
    }

    try {
      // Convert string IDs to numbers for ESI API
      const numericIds = ids.map((id) => Number.parseInt(id, 10)).filter((id) => !Number.isNaN(id));

      this.logger.info({ count: numericIds.length }, 'Fetching entity names from ESI');

      // Fetch names from ESI using the universe/names endpoint
      const namesMap = await this.esiClient.getUniverseNames(numericIds);

      // Convert the Map<number, UniverseName> to Map<string, { name, ticker? }>
      const result = new Map<string, { name: string; ticker?: string }>();

      for (const [id, nameInfo] of namesMap.entries()) {
        const stringId = id.toString();

        // For alliances and corporations, also fetch detailed info to get tickers
        if (nameInfo.category === 'alliance') {
          try {
            const allianceInfo = await this.esiClient.getAllianceInfo(id);
            result.set(stringId, {
              name: allianceInfo.name,
              ticker: allianceInfo.ticker,
            });
          } catch (error) {
            // If detailed fetch fails, use the basic name
            result.set(stringId, { name: nameInfo.name });
          }
        } else if (nameInfo.category === 'corporation') {
          try {
            const corpInfo = await this.esiClient.getCorporationInfo(id);
            result.set(stringId, {
              name: corpInfo.name,
              ticker: corpInfo.ticker,
            });
          } catch (error) {
            // If detailed fetch fails, use the basic name
            result.set(stringId, { name: nameInfo.name });
          }
        } else {
          // For characters and other entities, just use the name
          result.set(stringId, { name: nameInfo.name });
        }
      }

      this.logger.info({ fetched: result.size, requested: ids.length }, 'Entity names fetched');

      return result;
    } catch (error) {
      this.logger.error({ error }, 'Failed to fetch entity names from ESI');
      return new Map();
    }
  }

  private async importDocuments(documents: EntityDocument[], entityType: string): Promise<void> {
    if (documents.length === 0) {
      this.logger.info({ entityType }, 'No documents to import for entity type');
      return;
    }

    const BATCH_SIZE = 100;
    const batches: EntityDocument[][] = [];

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      batches.push(documents.slice(i, i + BATCH_SIZE));
    }

    this.logger.info(
      { entityType, totalDocuments: documents.length, batches: batches.length },
      'Importing documents to Typesense',
    );

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const result = await this.typesenseClient.collections('entities').documents().import(batch, {
          action: 'upsert',
        });

        // Typesense returns an array of import results
        if (Array.isArray(result)) {
          for (const item of result) {
            if (item.success) {
              successCount++;
            } else {
              errorCount++;
              this.logger.warn(
                { entityType, documentId: item.document?.id, error: item.error },
                'Failed to index document',
              );
            }
          }
        } else {
          // Handle string response format (JSONL)
          const resultLines = String(result)
            .split('\n')
            .filter((line) => line.trim());
          for (const line of resultLines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.success) {
                successCount++;
              } else {
                errorCount++;
                this.logger.warn(
                  { entityType, documentId: parsed.document?.id, error: parsed.error },
                  'Failed to index document',
                );
              }
            } catch (parseError) {
              // Ignore parse errors for empty lines
            }
          }
        }

        this.logger.info(
          { entityType, batchNumber: i + 1, batchSize: batch.length },
          'Batch imported successfully',
        );
      } catch (error) {
        errorCount += batch.length;
        this.logger.error(
          { entityType, error, batchNumber: i + 1, batchSize: batch.length },
          'Failed to import batch',
        );
        // Continue with other batches even if one fails
      }
    }

    this.logger.info(
      { entityType, totalDocuments: documents.length, successCount, errorCount },
      'Document import completed',
    );
  }
}
