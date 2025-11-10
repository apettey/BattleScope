/**
 * Search Service
 *
 * Provides high-level search operations for battles, entities, and systems
 */

import { trace } from '@opentelemetry/api';
import type { Logger } from 'pino';
import type { TypesenseClient } from './typesense-client.js';
import type {
  EntityAutocompleteRequest,
  EntityAutocompleteResponse,
  EntityDocument,
  EntitySearchResult,
  SystemAutocompleteRequest,
  SystemAutocompleteResponse,
  SystemDocument,
  SystemSearchResult,
  BattleSearchRequest,
  BattleSearchResponse,
  BattleDocument,
  BattleSearchResult,
  GlobalSearchResponse,
  SpaceType,
  SecurityLevel,
} from './types.js';

const tracer = trace.getTracer('battlescope.search.service');

export class SearchService {
  private client: TypesenseClient;
  private logger: Logger;

  constructor(client: TypesenseClient, logger: Logger) {
    this.client = client;
    this.logger = logger.child({ component: 'search-service' });
  }

  /**
   * Autocomplete search for entities (alliances, corporations, characters)
   */
  async autocompleteEntities(
    request: EntityAutocompleteRequest,
  ): Promise<EntityAutocompleteResponse> {
    const span = tracer.startSpan('search.autocomplete_entities', {
      attributes: {
        'search.query': request.q,
        'search.types': request.type?.join(',') ?? 'all',
        'search.limit': request.limit ?? 10,
      },
    });

    const startTime = Date.now();

    try {
      // Build filter for entity types
      let filterBy = '';
      if (request.type && request.type.length > 0) {
        const typeFilters = request.type.map((t) => `type:=${t}`).join(' || ');
        filterBy = `(${typeFilters})`;
      }

      // Search entities collection
      const searchParams: any = {
        q: request.q,
        query_by: 'name,ticker',
        num_typos: 2,
        prefix: true,
        per_page: request.limit ?? 10,
        sort_by: 'activityScore:desc',
      };

      if (filterBy) {
        searchParams.filter_by = filterBy;
      }

      const result = await this.client.search<EntityDocument>(
        'entities',
        searchParams,
        'autocomplete_entities',
      );

      // Group results by type
      const alliances: EntitySearchResult[] = [];
      const corporations: EntitySearchResult[] = [];
      const characters: EntitySearchResult[] = [];

      for (const hit of (result.hits ?? []) as any[]) {
        const doc = hit.document as EntityDocument;
        const entity: EntitySearchResult = {
          id: doc.id,
          type: doc.type as any,
          name: doc.name,
          ticker: doc.ticker,
          allianceId: doc.allianceId ?? undefined,
          allianceName: doc.allianceName ?? undefined,
          corpId: doc.corpId ?? undefined,
          corpName: doc.corpName ?? undefined,
          battleCount: doc.battleCount,
          lastSeenAt: new Date(doc.lastSeenAt).toISOString(),
        };

        switch (doc.type) {
          case 'alliance':
            alliances.push(entity);
            break;
          case 'corporation':
            corporations.push(entity);
            break;
          case 'character':
            characters.push(entity);
            break;
        }
      }

      const response: EntityAutocompleteResponse = {
        alliances,
        corporations,
        characters,
        processingTimeMs: Date.now() - startTime,
        query: request.q,
      };

      span.setAttributes({
        'search.alliances_found': alliances.length,
        'search.corporations_found': corporations.length,
        'search.characters_found': characters.length,
      });

      span.end();
      return response;
    } catch (error) {
      this.logger.error({ err: error, request }, 'Entity autocomplete failed');
      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Autocomplete failed',
      });
      span.end();
      throw error;
    }
  }

  /**
   * Autocomplete search for systems
   */
  async autocompleteSystems(
    request: SystemAutocompleteRequest,
  ): Promise<SystemAutocompleteResponse> {
    const span = tracer.startSpan('search.autocomplete_systems', {
      attributes: {
        'search.query': request.q,
        'search.space_types': request.spaceType?.join(',') ?? 'all',
        'search.limit': request.limit ?? 10,
      },
    });

    const startTime = Date.now();

    try {
      // Build filter for space types
      let filterBy = '';
      if (request.spaceType && request.spaceType.length > 0) {
        const typeFilters = request.spaceType.map((t) => `spaceType:=${t}`).join(' || ');
        filterBy = `(${typeFilters})`;
      }

      // Search systems collection
      const searchParams: any = {
        q: request.q,
        query_by: 'name,regionName,constellationName',
        num_typos: 2,
        prefix: true,
        per_page: request.limit ?? 10,
        sort_by: 'activityScore:desc',
      };

      if (filterBy) {
        searchParams.filter_by = filterBy;
      }

      const result = await this.client.search<SystemDocument>(
        'systems',
        searchParams,
        'autocomplete_systems',
      );

      const systems: SystemSearchResult[] = ((result.hits ?? []) as any[]).map((hit: any) => {
        const doc = hit.document as SystemDocument;
        return {
          id: doc.id,
          name: doc.name,
          regionId: doc.regionId,
          regionName: doc.regionName,
          constellationId: doc.constellationId,
          constellationName: doc.constellationName,
          spaceType: doc.spaceType as SpaceType,
          securityLevel: doc.securityLevel as SecurityLevel | null,
          securityStatus: doc.securityStatus,
          battleCount: doc.battleCount,
          lastBattleAt: doc.lastBattleAt ? new Date(doc.lastBattleAt).toISOString() : null,
        };
      });

      const response: SystemAutocompleteResponse = {
        systems,
        processingTimeMs: Date.now() - startTime,
        query: request.q,
      };

      span.setAttribute('search.systems_found', systems.length);
      span.end();
      return response;
    } catch (error) {
      this.logger.error({ err: error, request }, 'System autocomplete failed');
      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Autocomplete failed',
      });
      span.end();
      throw error;
    }
  }

  /**
   * Advanced battle search with filters and pagination
   */
  async searchBattles(request: BattleSearchRequest): Promise<BattleSearchResponse> {
    const span = tracer.startSpan('search.battles', {
      attributes: {
        'search.query': request.query ?? '*',
        'search.has_filters': !!request.filters,
      },
    });

    const startTime = Date.now();

    try {
      // Build filter expressions
      const filterExpressions: string[] = [];

      if (request.filters) {
        const { filters } = request;

        // Space type filter
        if (filters.spaceType && filters.spaceType.length > 0) {
          const typeFilters = filters.spaceType.map((t) => `spaceType:=${t}`).join(' || ');
          filterExpressions.push(`(${typeFilters})`);
        }

        // Security level filter
        if (filters.securityLevel && filters.securityLevel.length > 0) {
          const secFilters = filters.securityLevel.map((s) => `securityLevel:=${s}`).join(' || ');
          filterExpressions.push(`(${secFilters})`);
        }

        // Time range filters
        if (filters.startTime?.after) {
          const timestamp = Math.floor(new Date(filters.startTime.after).getTime() / 1000);
          filterExpressions.push(`startTime:>=${timestamp}`);
        }
        if (filters.startTime?.before) {
          const timestamp = Math.floor(new Date(filters.startTime.before).getTime() / 1000);
          filterExpressions.push(`startTime:<=${timestamp}`);
        }

        // Numeric range filters
        if (filters.totalKills?.min !== undefined) {
          filterExpressions.push(`totalKills:>=${filters.totalKills.min}`);
        }
        if (filters.totalKills?.max !== undefined) {
          filterExpressions.push(`totalKills:<=${filters.totalKills.max}`);
        }

        if (filters.totalIskDestroyed?.min !== undefined) {
          filterExpressions.push(`totalIskDestroyed:>=${filters.totalIskDestroyed.min}`);
        }
        if (filters.totalIskDestroyed?.max !== undefined) {
          filterExpressions.push(`totalIskDestroyed:<=${filters.totalIskDestroyed.max}`);
        }

        if (filters.totalParticipants?.min !== undefined) {
          filterExpressions.push(`totalParticipants:>=${filters.totalParticipants.min}`);
        }
        if (filters.totalParticipants?.max !== undefined) {
          filterExpressions.push(`totalParticipants:<=${filters.totalParticipants.max}`);
        }

        if (filters.duration?.min !== undefined) {
          filterExpressions.push(`duration:>=${filters.duration.min}`);
        }
        if (filters.duration?.max !== undefined) {
          filterExpressions.push(`duration:<=${filters.duration.max}`);
        }

        // System IDs filter
        if (filters.systemIds && filters.systemIds.length > 0) {
          const systemFilters = filters.systemIds.map((id) => `systemId:=${id}`).join(' || ');
          filterExpressions.push(`(${systemFilters})`);
        }
      }

      // Build search parameters
      const searchParams: any = {
        q: request.query || '*',
        query_by: 'systemName,allianceNames',
        per_page: request.page?.limit ?? 20,
        page: Math.floor((request.page?.offset ?? 0) / (request.page?.limit ?? 20)) + 1,
      };

      if (filterExpressions.length > 0) {
        searchParams.filter_by = filterExpressions.join(' && ');
      }

      // Add sorting
      if (request.sort) {
        const sortField = request.sort.by;
        const sortOrder = request.sort.order;
        searchParams.sort_by = `${sortField}:${sortOrder}`;
      } else {
        searchParams.sort_by = 'startTime:desc';
      }

      // Enable faceting
      searchParams.facet_by = 'spaceType,securityLevel';

      const result = await this.client.search<BattleDocument>(
        'battles',
        searchParams,
        'search_battles',
      );

      // Transform results
      const hits: BattleSearchResult[] = ((result.hits ?? []) as any[]).map((hit: any) => {
        const doc = hit.document as BattleDocument;
        return {
          id: doc.id,
          systemId: doc.systemId,
          systemName: doc.systemName,
          regionName: doc.regionName,
          spaceType: doc.spaceType as SpaceType,
          securityLevel: doc.securityLevel as SecurityLevel | null,
          startTime: new Date(doc.startTime * 1000).toISOString(),
          endTime: new Date(doc.endTime * 1000).toISOString(),
          duration: doc.duration,
          totalKills: doc.totalKills,
          totalParticipants: doc.totalParticipants,
          totalIskDestroyed: doc.totalIskDestroyed,
          allianceNames: doc.allianceNames,
          _relevanceScore: hit.text_match ? hit.text_match / 1000000 : undefined,
        };
      });

      // Extract facet counts
      const facets: any = {};
      if (result.facet_counts) {
        for (const facet of result.facet_counts as any[]) {
          facets[facet.field_name] = Object.fromEntries(
            facet.counts.map((c: any) => [c.value, c.count]),
          );
        }
      }

      const response: BattleSearchResponse = {
        hits,
        estimatedTotalHits: result.found ?? 0,
        limit: request.page?.limit ?? 20,
        offset: request.page?.offset ?? 0,
        processingTimeMs: Date.now() - startTime,
        query: request.query,
        facets,
      };

      span.setAttributes({
        'search.hits': hits.length,
        'search.total_found': result.found ?? 0,
      });

      span.end();
      return response;
    } catch (error) {
      this.logger.error({ err: error, request }, 'Battle search failed');
      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Search failed',
      });
      span.end();
      throw error;
    }
  }

  /**
   * Global search across all data types
   */
  async searchGlobal(query: string, limit: number = 5): Promise<GlobalSearchResponse> {
    const span = tracer.startSpan('search.global', {
      attributes: {
        'search.query': query,
        'search.limit': limit,
      },
    });

    const startTime = Date.now();

    try {
      // Search all three collections in parallel
      const [battlesResult, entitiesResult, systemsResult] = await Promise.all([
        this.client.search<BattleDocument>(
          'battles',
          {
            q: query,
            query_by: 'systemName,allianceNames',
            num_typos: 2,
            prefix: true,
            per_page: limit,
            sort_by: 'battleScore:desc',
          },
          'global_search_battles',
        ),
        this.client.search<EntityDocument>(
          'entities',
          {
            q: query,
            query_by: 'name,ticker',
            num_typos: 2,
            prefix: true,
            per_page: limit,
            sort_by: 'activityScore:desc',
          },
          'global_search_entities',
        ),
        this.client.search<SystemDocument>(
          'systems',
          {
            q: query,
            query_by: 'name,regionName',
            num_typos: 2,
            prefix: true,
            per_page: limit,
            sort_by: 'activityScore:desc',
          },
          'global_search_systems',
        ),
      ]);

      // Transform battles
      const battles: BattleSearchResult[] = ((battlesResult.hits ?? []) as any[]).map(
        (hit: any) => {
          const doc = hit.document as BattleDocument;
          return {
            id: doc.id,
            systemId: doc.systemId,
            systemName: doc.systemName,
            regionName: doc.regionName,
            spaceType: doc.spaceType as SpaceType,
            securityLevel: doc.securityLevel as SecurityLevel | null,
            startTime: new Date(doc.startTime * 1000).toISOString(),
            endTime: new Date(doc.endTime * 1000).toISOString(),
            duration: doc.duration,
            totalKills: doc.totalKills,
            totalParticipants: doc.totalParticipants,
            totalIskDestroyed: doc.totalIskDestroyed,
            allianceNames: doc.allianceNames,
            _relevanceScore: hit.text_match ? hit.text_match / 1000000 : undefined,
          };
        },
      );

      // Group entities by type
      const alliances: EntitySearchResult[] = [];
      const corporations: EntitySearchResult[] = [];
      const characters: EntitySearchResult[] = [];

      for (const hit of (entitiesResult.hits ?? []) as any[]) {
        const doc = hit.document as EntityDocument;
        const entity: EntitySearchResult = {
          id: doc.id,
          type: doc.type as any,
          name: doc.name,
          ticker: doc.ticker,
          allianceId: doc.allianceId ?? undefined,
          allianceName: doc.allianceName ?? undefined,
          corpId: doc.corpId ?? undefined,
          corpName: doc.corpName ?? undefined,
          battleCount: doc.battleCount,
          lastSeenAt: new Date(doc.lastSeenAt).toISOString(),
        };

        switch (doc.type) {
          case 'alliance':
            alliances.push(entity);
            break;
          case 'corporation':
            corporations.push(entity);
            break;
          case 'character':
            characters.push(entity);
            break;
        }
      }

      // Transform systems
      const systems: SystemSearchResult[] = ((systemsResult.hits ?? []) as any[]).map(
        (hit: any) => {
          const doc = hit.document as SystemDocument;
          return {
            id: doc.id,
            name: doc.name,
            regionId: doc.regionId,
            regionName: doc.regionName,
            constellationId: doc.constellationId,
            constellationName: doc.constellationName,
            spaceType: doc.spaceType as SpaceType,
            securityLevel: doc.securityLevel as SecurityLevel | null,
            securityStatus: doc.securityStatus,
            battleCount: doc.battleCount,
            lastBattleAt: doc.lastBattleAt ? new Date(doc.lastBattleAt).toISOString() : null,
          };
        },
      );

      const response: GlobalSearchResponse = {
        battles,
        entities: {
          alliances,
          corporations,
          characters,
        },
        systems,
        processingTimeMs: Date.now() - startTime,
        query,
        totalResults: {
          battles: battlesResult.found ?? 0,
          entities: entitiesResult.found ?? 0,
          systems: systemsResult.found ?? 0,
        },
      };

      span.setAttributes({
        'search.battles_found': battles.length,
        'search.entities_found': alliances.length + corporations.length + characters.length,
        'search.systems_found': systems.length,
      });

      span.end();
      return response;
    } catch (error) {
      this.logger.error({ err: error, query }, 'Global search failed');
      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Global search failed',
      });
      span.end();
      throw error;
    }
  }

  /**
   * Get the underlying Typesense client for advanced operations
   */
  getClient(): TypesenseClient {
    return this.client;
  }
}

/**
 * Factory function to create a SearchService
 */
export function createSearchService(client: TypesenseClient, logger: Logger): SearchService {
  return new SearchService(client, logger);
}
