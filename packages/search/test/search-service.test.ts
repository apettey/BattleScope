import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService, createSearchService } from '../src/search-service.js';
import type { TypesenseClient } from '../src/typesense-client.js';
import { pino } from 'pino';

describe('SearchService', () => {
  let mockClient: Partial<TypesenseClient>;
  let logger: pino.Logger;
  let service: SearchService;

  beforeEach(() => {
    logger = pino({ level: 'silent' });

    mockClient = {
      search: vi.fn(),
      getClient: vi.fn(),
    };

    service = new SearchService(mockClient as TypesenseClient, logger);
  });

  describe('autocompleteEntities', () => {
    it('should search entities and group by type', async () => {
      const mockResults = {
        hits: [
          {
            document: {
              id: '1',
              type: 'alliance',
              name: 'Test Alliance',
              ticker: 'TEST',
              battleCount: 100,
              lastSeenAt: '2024-01-01T00:00:00Z',
              activityScore: 1000,
            },
          },
          {
            document: {
              id: '2',
              type: 'corporation',
              name: 'Test Corp',
              ticker: 'TCORP',
              allianceId: '1',
              allianceName: 'Test Alliance',
              battleCount: 50,
              lastSeenAt: '2024-01-02T00:00:00Z',
              activityScore: 500,
            },
          },
          {
            document: {
              id: '3',
              type: 'character',
              name: 'Test Character',
              ticker: null,
              corpId: '2',
              corpName: 'Test Corp',
              allianceId: '1',
              allianceName: 'Test Alliance',
              battleCount: 25,
              lastSeenAt: '2024-01-03T00:00:00Z',
              activityScore: 250,
            },
          },
        ],
        found: 3,
      };

      (mockClient.search as any).mockResolvedValue(mockResults);

      const result = await service.autocompleteEntities({ q: 'test', limit: 10 });

      expect(result.alliances).toHaveLength(1);
      expect(result.corporations).toHaveLength(1);
      expect(result.characters).toHaveLength(1);
      expect(result.alliances[0].name).toBe('Test Alliance');
      expect(result.corporations[0].allianceName).toBe('Test Alliance');
      expect(result.characters[0].corpName).toBe('Test Corp');
      expect(result.query).toBe('test');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

      expect(mockClient.search).toHaveBeenCalledWith(
        'entities',
        expect.objectContaining({
          q: 'test',
          query_by: 'name,ticker',
          num_typos: 2,
          prefix: true,
          per_page: 10,
          sort_by: 'activityScore:desc',
        }),
        'autocomplete_entities',
      );
    });

    it('should filter by entity type', async () => {
      const mockResults = {
        hits: [
          {
            document: {
              id: '1',
              type: 'alliance',
              name: 'Test Alliance',
              ticker: 'TEST',
              battleCount: 100,
              lastSeenAt: '2024-01-01T00:00:00Z',
              activityScore: 1000,
            },
          },
        ],
        found: 1,
      };

      (mockClient.search as any).mockResolvedValue(mockResults);

      const result = await service.autocompleteEntities({
        q: 'test',
        type: ['alliance'],
        limit: 10,
      });

      expect(result.alliances).toHaveLength(1);
      expect(result.corporations).toHaveLength(0);
      expect(result.characters).toHaveLength(0);

      expect(mockClient.search).toHaveBeenCalledWith(
        'entities',
        expect.objectContaining({
          filter_by: '(type:=alliance)',
        }),
        'autocomplete_entities',
      );
    });

    it('should handle multiple type filters', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.autocompleteEntities({
        q: 'test',
        type: ['alliance', 'corporation'],
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'entities',
        expect.objectContaining({
          filter_by: '(type:=alliance || type:=corporation)',
        }),
        'autocomplete_entities',
      );
    });

    it('should handle search errors', async () => {
      const mockError = new Error('Search failed');
      (mockClient.search as any).mockRejectedValue(mockError);

      await expect(service.autocompleteEntities({ q: 'test' })).rejects.toThrow('Search failed');
    });

    it('should handle empty results', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      const result = await service.autocompleteEntities({ q: 'nonexistent' });

      expect(result.alliances).toHaveLength(0);
      expect(result.corporations).toHaveLength(0);
      expect(result.characters).toHaveLength(0);
      expect(result.query).toBe('nonexistent');
    });
  });

  describe('autocompleteSystems', () => {
    it('should search systems', async () => {
      const mockResults = {
        hits: [
          {
            document: {
              id: '1',
              name: 'Jita',
              regionId: '10000002',
              regionName: 'The Forge',
              constellationId: '20000020',
              constellationName: 'Kimotoro',
              securityType: 'nullsec',
              securityStatus: 0.946,
              battleCount: 500,
              lastBattleAt: '2024-01-01T00:00:00Z',
              activityScore: 5000,
            },
          },
        ],
        found: 1,
      };

      (mockClient.search as any).mockResolvedValue(mockResults);

      const result = await service.autocompleteSystems({ q: 'jita', limit: 10 });

      expect(result.systems).toHaveLength(1);
      expect(result.systems[0].name).toBe('Jita');
      expect(result.systems[0].securityType).toBe('nullsec');
      expect(result.systems[0].securityType).toBe('highsec');
      expect(result.query).toBe('jita');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

      expect(mockClient.search).toHaveBeenCalledWith(
        'systems',
        expect.objectContaining({
          q: 'jita',
          query_by: 'name,regionName,constellationName',
          num_typos: 2,
          prefix: true,
          per_page: 10,
          sort_by: 'activityScore:desc',
        }),
        'autocomplete_systems',
      );
    });

    it('should filter by space type', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.autocompleteSystems({
        q: 'test',
        securityType: ['wormhole'],
        limit: 10,
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'systems',
        expect.objectContaining({
          filter_by: '(securityType:=jspace)',
        }),
        'autocomplete_systems',
      );
    });

    it('should handle multiple space type filters', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.autocompleteSystems({
        q: 'test',
        securityType: ['nullsec', 'wormhole'],
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'systems',
        expect.objectContaining({
          filter_by: '(securityType:=kspace || securityType:=jspace)',
        }),
        'autocomplete_systems',
      );
    });

    it('should handle systems without last battle date', async () => {
      const mockResults = {
        hits: [
          {
            document: {
              id: '1',
              name: 'Empty System',
              regionId: '1',
              regionName: 'Test',
              constellationId: '1',
              constellationName: 'Test',
              securityType: 'nullsec',
              securityStatus: 0.0,
              battleCount: 0,
              lastBattleAt: null,
              activityScore: 0,
            },
          },
        ],
        found: 1,
      };

      (mockClient.search as any).mockResolvedValue(mockResults);

      const result = await service.autocompleteSystems({ q: 'empty' });

      expect(result.systems[0].lastBattleAt).toBeNull();
    });
  });

  describe('searchBattles', () => {
    it('should search battles with default parameters', async () => {
      const mockResults = {
        hits: [
          {
            document: {
              id: 'battle-1',
              systemId: '1',
              systemName: 'M-OEE8',
              regionName: 'Delve',
              securityType: 'nullsec',
              startTime: 1704067200,
              endTime: 1704070800,
              duration: 3600,
              totalKills: 150,
              totalParticipants: 500,
              totalIskDestroyed: 50000000000,
              allianceNames: ['Test Alliance', 'Another Alliance'],
              battleScore: 1500,
            },
            text_match: 850000,
          },
        ],
        found: 1,
        facet_counts: [
          {
            field_name: 'securityType',
            counts: [
              { value: 'nullsec', count: 10 },
              { value: 'wormhole', count: 5 },
            ],
          },
        ],
      };

      (mockClient.search as any).mockResolvedValue(mockResults);

      const result = await service.searchBattles({});

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0].systemName).toBe('M-OEE8');
      expect(result.hits[0].totalKills).toBe(150);
      expect(result.hits[0]._relevanceScore).toBeCloseTo(0.85);
      expect(result.estimatedTotalHits).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.facets).toBeDefined();
      expect(result.facets?.securityType).toEqual({ kspace: 10, jspace: 5 });

      expect(mockClient.search).toHaveBeenCalledWith(
        'battles',
        expect.objectContaining({
          q: '*',
          query_by: 'systemName,allianceNames',
          per_page: 20,
          page: 1,
          sort_by: 'startTime:desc',
          facet_by: 'securityType,securityType',
        }),
        'search_battles',
      );
    });

    it('should apply space type filter', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.searchBattles({
        filters: {
          securityType: ['nullsec'],
        },
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'battles',
        expect.objectContaining({
          filter_by: '(securityType:=kspace)',
        }),
        'search_battles',
      );
    });

    it('should apply numeric range filters', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.searchBattles({
        filters: {
          totalKills: { min: 10, max: 100 },
          totalIskDestroyed: { min: 1000000000 },
          totalParticipants: { max: 500 },
          duration: { min: 600, max: 3600 },
        },
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'battles',
        expect.objectContaining({
          filter_by: expect.stringContaining('totalKills:>=10'),
        }),
        'search_battles',
      );

      const call = (mockClient.search as any).mock.calls[0];
      const filterBy = call[1].filter_by;

      expect(filterBy).toContain('totalKills:>=10');
      expect(filterBy).toContain('totalKills:<=100');
      expect(filterBy).toContain('totalIskDestroyed:>=1000000000');
      expect(filterBy).toContain('totalParticipants:<=500');
      expect(filterBy).toContain('duration:>=600');
      expect(filterBy).toContain('duration:<=3600');
    });

    it('should apply time range filters', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      const afterDate = '2024-01-01T00:00:00Z';
      const beforeDate = '2024-12-31T23:59:59Z';

      await service.searchBattles({
        filters: {
          startTime: {
            after: afterDate,
            before: beforeDate,
          },
        },
      });

      const call = (mockClient.search as any).mock.calls[0];
      const filterBy = call[1].filter_by;

      const afterTimestamp = Math.floor(new Date(afterDate).getTime() / 1000);
      const beforeTimestamp = Math.floor(new Date(beforeDate).getTime() / 1000);

      expect(filterBy).toContain(`startTime:>=${afterTimestamp}`);
      expect(filterBy).toContain(`startTime:<=${beforeTimestamp}`);
    });

    it('should apply system IDs filter', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.searchBattles({
        filters: {
          systemIds: ['30000142', '30000144'],
        },
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'battles',
        expect.objectContaining({
          filter_by: '(systemId:=30000142 || systemId:=30000144)',
        }),
        'search_battles',
      );
    });

    it('should apply custom sorting', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.searchBattles({
        sort: {
          by: 'totalKills',
          order: 'desc',
        },
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'battles',
        expect.objectContaining({
          sort_by: 'totalKills:desc',
        }),
        'search_battles',
      );
    });

    it('should handle pagination', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.searchBattles({
        page: {
          limit: 50,
          offset: 100,
        },
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        'battles',
        expect.objectContaining({
          per_page: 50,
          page: 3, // offset 100 / limit 50 + 1 = 3
        }),
        'search_battles',
      );
    });

    it('should combine multiple filters', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.searchBattles({
        query: 'pandemic',
        filters: {
          securityType: ['nullsec'],
          totalKills: { min: 10 },
        },
      });

      const call = (mockClient.search as any).mock.calls[0];
      const params = call[1];

      expect(params.q).toBe('pandemic');
      expect(params.filter_by).toContain('securityType:=kspace');
      expect(params.filter_by).toContain('totalKills:>=10');
      expect(params.filter_by).toMatch(/&&/); // Filters joined with &&
    });
  });

  describe('searchGlobal', () => {
    it('should search across all collections in parallel', async () => {
      const mockBattlesResult = {
        hits: [
          {
            document: {
              id: 'battle-1',
              systemId: '1',
              systemName: 'M-OEE8',
              regionName: 'Delve',
              securityType: 'nullsec',
              startTime: 1704067200,
              endTime: 1704070800,
              duration: 3600,
              totalKills: 100,
              totalParticipants: 300,
              totalIskDestroyed: 50000000000,
              allianceNames: ['Test Alliance'],
              battleScore: 1000,
            },
          },
        ],
        found: 1,
      };

      const mockEntitiesResult = {
        hits: [
          {
            document: {
              id: '1',
              type: 'alliance',
              name: 'Test Alliance',
              ticker: 'TEST',
              battleCount: 50,
              lastSeenAt: '2024-01-01T00:00:00Z',
              activityScore: 500,
            },
          },
        ],
        found: 1,
      };

      const mockSystemsResult = {
        hits: [
          {
            document: {
              id: '1',
              name: 'M-OEE8',
              regionId: '10000060',
              regionName: 'Delve',
              constellationId: '1',
              constellationName: 'Test',
              securityType: 'nullsec',
              securityStatus: -0.5,
              battleCount: 200,
              lastBattleAt: '2024-01-01T00:00:00Z',
              activityScore: 2000,
            },
          },
        ],
        found: 1,
      };

      (mockClient.search as any)
        .mockResolvedValueOnce(mockBattlesResult)
        .mockResolvedValueOnce(mockEntitiesResult)
        .mockResolvedValueOnce(mockSystemsResult);

      const result = await service.searchGlobal('test', 5);

      expect(result.battles).toHaveLength(1);
      expect(result.entities.alliances).toHaveLength(1);
      expect(result.systems).toHaveLength(1);
      expect(result.totalResults.battles).toBe(1);
      expect(result.totalResults.entities).toBe(1);
      expect(result.totalResults.systems).toBe(1);
      expect(result.query).toBe('test');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

      // Should have called search 3 times (once per collection)
      expect(mockClient.search).toHaveBeenCalledTimes(3);
    });

    it('should handle empty results across all collections', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      const result = await service.searchGlobal('nonexistent');

      expect(result.battles).toHaveLength(0);
      expect(result.entities.alliances).toHaveLength(0);
      expect(result.entities.corporations).toHaveLength(0);
      expect(result.entities.characters).toHaveLength(0);
      expect(result.systems).toHaveLength(0);
      expect(result.totalResults.battles).toBe(0);
      expect(result.totalResults.entities).toBe(0);
      expect(result.totalResults.systems).toBe(0);
    });

    it('should use custom limit', async () => {
      (mockClient.search as any).mockResolvedValue({ hits: [], found: 0 });

      await service.searchGlobal('test', 10);

      // Each search should use limit of 10
      expect((mockClient.search as any).mock.calls[0][1].per_page).toBe(10);
      expect((mockClient.search as any).mock.calls[1][1].per_page).toBe(10);
      expect((mockClient.search as any).mock.calls[2][1].per_page).toBe(10);
    });

    it('should handle partial failures gracefully', async () => {
      const mockError = new Error('Collection not found');

      (mockClient.search as any)
        .mockResolvedValueOnce({ hits: [], found: 0 })
        .mockRejectedValueOnce(mockError);

      await expect(service.searchGlobal('test')).rejects.toThrow('Collection not found');
    });
  });

  describe('getClient', () => {
    it('should return the underlying Typesense client', () => {
      const client = service.getClient();
      expect(client).toBe(mockClient);
    });
  });

  describe('createSearchService factory', () => {
    it('should create a SearchService instance', () => {
      const service = createSearchService(mockClient as TypesenseClient, logger);
      expect(service).toBeInstanceOf(SearchService);
      expect(service.getClient()).toBe(mockClient);
    });
  });
});
