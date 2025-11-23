import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import type {
  BattleRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  AccountRepository,
  CharacterRepository,
  FeatureRepository,
  AuthConfigRepository,
  AuditLogRepository,
  PilotShipHistoryRepository,
  DatabaseClient,
} from '@battlescope/database';
import type { SearchService } from '@battlescope/search';
import type { NameEnricher } from '../src/services/name-enricher.js';
import type { EsiClient } from '@battlescope/esi-client';

// TODO: Fix mock setup for API integration tests
describe.skip('API OpenAPI Compliance Tests', () => {
  let server: FastifyInstance;

  // Mock repositories - cast to the full type to avoid TypeScript strict checking in test mocks
  const mockBattleRepo = {
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue({ battles: [], nextCursor: null }),
    getBattlesByAlliance: vi.fn().mockResolvedValue({ battles: [], nextCursor: null }),
    getBattlesByCorporation: vi.fn().mockResolvedValue({ battles: [], nextCursor: null }),
    getBattlesByCharacter: vi.fn().mockResolvedValue({ battles: [], nextCursor: null }),
  } as unknown as BattleRepository;

  const mockKillmailRepo = {
    getRecentKillmails: vi.fn().mockResolvedValue([]),
  } as unknown as KillmailRepository;

  const mockRulesetRepo: Partial<RulesetRepository> = {};
  const mockDashboardRepo = {
    getStats: vi.fn().mockResolvedValue({
      totalBattles: 0,
      totalKills: 0,
      totalValue: '0',
    }),
  } as unknown as DashboardRepository;

  const mockAccountRepo: Partial<AccountRepository> = {};
  const mockCharacterRepo: Partial<CharacterRepository> = {};
  const mockFeatureRepo: Partial<FeatureRepository> = {};
  const mockAuthConfigRepo: Partial<AuthConfigRepository> = {};
  const mockAuditLogRepo: Partial<AuditLogRepository> = {};

  const mockDb = {
    execute: vi.fn(),
  } as unknown as DatabaseClient;

  const mockNameEnricher = {
    enrichBattle: vi.fn().mockImplementation((battle) => Promise.resolve(battle)),
    enrichKillmail: vi.fn().mockImplementation((killmail) => Promise.resolve(killmail)),
  } as unknown as NameEnricher;

  const mockEsiClient: Partial<EsiClient> = {};

  const mockSearchService = {
    search: vi.fn().mockResolvedValue({ results: [], found: 0 }),
  } as unknown as SearchService;

  const mockShipHistoryRepo = {
    getCharacterShipSummary: vi.fn().mockResolvedValue([]),
    getCharacterIskTotals: vi.fn().mockResolvedValue({
      totalIskDestroyed: 0n,
      totalIskLost: 0n,
      totalKills: 0,
      totalLosses: 0,
    }),
    getCharacterLosses: vi.fn().mockResolvedValue([]),
  } as unknown as PilotShipHistoryRepository;

  beforeAll(async () => {
    // Load OpenAPI spec - currently not used but available for future validation tests
    const specPath = path.join(process.cwd(), '../../docs/openapi.yaml');
    const specContent = await fs.readFile(specPath, 'utf-8');
    const _openApiSpec = yaml.parse(specContent) as Record<string, unknown>;
    void _openApiSpec; // Loaded for future use

    // Build server with test configuration
    server = buildServer({
      battleRepository: mockBattleRepo as BattleRepository,
      killmailRepository: mockKillmailRepo as KillmailRepository,
      rulesetRepository: mockRulesetRepo as RulesetRepository,
      dashboardRepository: mockDashboardRepo as DashboardRepository,
      accountRepository: mockAccountRepo as AccountRepository,
      characterRepository: mockCharacterRepo as CharacterRepository,
      featureRepository: mockFeatureRepo as FeatureRepository,
      authConfigRepository: mockAuthConfigRepo as AuthConfigRepository,
      auditLogRepository: mockAuditLogRepo as AuditLogRepository,
      db: mockDb as DatabaseClient,
      config: {
        port: 3000,
        host: '0.0.0.0',
        developerMode: true,
        corsAllowedOrigins: ['http://localhost:5173'],
        esiBaseUrl: 'https://esi.evetech.net/latest/',
        esiDatasource: 'tranquility',
        esiCompatibilityDate: '2025-09-30',
        esiTimeoutMs: 10000,
        esiCacheTtlSeconds: 300,
        encryptionKey: 'test-encryption-key-32-characters-long',
        sessionTtlSeconds: 28800,
        sessionCookieName: 'battlescope_session',
        sessionCookieSecure: false,
        authzCacheTtlSeconds: 60,
        frontendUrl: 'http://localhost:5173',
        typesenseHost: 'localhost',
        typesensePort: 8108,
        typesenseProtocol: 'http',
        typesenseApiKey: 'test-api-key',
        eveScopes: ['publicData'],
      },
      nameEnricher: mockNameEnricher as NameEnricher,
      esiClient: mockEsiClient as EsiClient,
      searchService: mockSearchService as SearchService,
      shipHistoryRepository: mockShipHistoryRepo as PilotShipHistoryRepository,
    });

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /battles', () => {
    it('should match OpenAPI spec schema', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/battles',
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('nextCursor');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('should accept limit parameter', async () => {
      // Arrange
      const limit = 10;
      const response = await server.inject({
        method: 'GET',
        url: `/battles?limit=${limit}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items.length).toBeLessThanOrEqual(limit);
    });

    it('should accept cursor parameter for pagination', async () => {
      // Arrange
      const cursor = Buffer.from(
        JSON.stringify({
          startTime: new Date().toISOString(),
          id: '00000000-0000-0000-0000-000000000000',
        }),
      ).toString('base64');

      const response = await server.inject({
        method: 'GET',
        url: `/battles?cursor=${encodeURIComponent(cursor)}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
    });

    it('should filter by spaceType parameter', async () => {
      // Arrange
      const spaceTypes = ['kspace', 'jspace', 'pochven'];

      for (const spaceType of spaceTypes) {
        const response = await server.inject({
          method: 'GET',
          url: `/battles?spaceType=${spaceType}`,
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        if (body.items.length > 0) {
          body.items.forEach((battle: { spaceType: string }) => {
            expect(battle.spaceType).toBe(spaceType);
          });
        }
      }
    });

    it('should filter by systemId parameter', async () => {
      // Arrange
      const systemId = '30000142'; // Jita

      const response = await server.inject({
        method: 'GET',
        url: `/battles?systemId=${systemId}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      if (body.items.length > 0) {
        body.items.forEach((battle: { systemId: string }) => {
          expect(battle.systemId).toBe(systemId);
        });
      }
    });

    it('should filter by time range (since/until)', async () => {
      // Arrange
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
      const until = new Date().toISOString();

      const response = await server.inject({
        method: 'GET',
        url: `/battles?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      if (body.items.length > 0) {
        body.items.forEach((battle: { startTime: string }) => {
          const battleTime = new Date(battle.startTime);
          expect(battleTime.getTime()).toBeGreaterThanOrEqual(new Date(since).getTime());
          expect(battleTime.getTime()).toBeLessThanOrEqual(new Date(until).getTime());
        });
      }
    });

    it('should reject invalid limit parameter', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/battles?limit=invalid',
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it('should reject limit exceeding maximum', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/battles?limit=1000',
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /battles/:id', () => {
    it('should return 404 for non-existent battle', async () => {
      // Arrange
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await server.inject({
        method: 'GET',
        url: `/battles/${nonExistentId}`,
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should reject invalid UUID format', async () => {
      // Arrange
      const invalidId = 'not-a-uuid';

      const response = await server.inject({
        method: 'GET',
        url: `/battles/${invalidId}`,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it('should return battle details when exists', async () => {
      // First, get a battle from the list
      const listResponse = await server.inject({
        method: 'GET',
        url: '/battles?limit=1',
      });

      const listBody = JSON.parse(listResponse.body);
      if (listBody.items.length > 0) {
        const battleId = listBody.items[0].id;

        // Arrange
        const response = await server.inject({
          method: 'GET',
          url: `/battles/${battleId}`,
        });

        // Assert
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('id', battleId);
        expect(body).toHaveProperty('startTime');
        expect(body).toHaveProperty('endTime');
        expect(body).toHaveProperty('systemId');
        expect(body).toHaveProperty('totalKills');
        expect(body).toHaveProperty('totalValue');
        expect(body).toHaveProperty('participants');
        expect(body).toHaveProperty('killmails');
      }
    });
  });

  describe('GET /killmails/feed', () => {
    it('should return killmail feed', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/killmails/feed',
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('should accept limit parameter', async () => {
      // Arrange
      const limit = 50;
      const response = await server.inject({
        method: 'GET',
        url: `/killmails/feed?limit=${limit}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items.length).toBeLessThanOrEqual(limit);
    });

    it('should filter by spaceType', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/killmails/feed?spaceType=kspace',
      });

      // Assert
      expect(response.statusCode).toBe(200);
    });
  });

  // TODO: Implement /dashboard/stats endpoint (currently /stats/summary exists)
  describe.skip('GET /dashboard/stats', () => {
    it('should return dashboard statistics', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/dashboard/stats',
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('totalBattles');
      expect(body).toHaveProperty('totalKills');
      expect(body).toHaveProperty('totalValue');
      expect(typeof body.totalBattles).toBe('number');
      expect(typeof body.totalKills).toBe('number');
      expect(typeof body.totalValue).toBe('string'); // bigint as string
    });

    it('should accept time range parameters', async () => {
      // Arrange
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago

      const response = await server.inject({
        method: 'GET',
        url: `/dashboard/stats?since=${encodeURIComponent(since)}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
    });
  });

  // TODO: Implement /alliances/:id/battles endpoint
  describe.skip('GET /alliances/:id/battles', () => {
    it('should return battles for an alliance', async () => {
      // Arrange
      const allianceId = '1354830081'; // Test Alliance ID

      const response = await server.inject({
        method: 'GET',
        url: `/alliances/${allianceId}/battles`,
      });

      // Assert
      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('items');
        expect(Array.isArray(body.items)).toBe(true);
      }
    });

    it('should reject invalid alliance ID', async () => {
      // Arrange
      const invalidId = 'not-a-number';

      const response = await server.inject({
        method: 'GET',
        url: `/alliances/${invalidId}/battles`,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });
  });

  // TODO: Implement /corporations/:id/battles endpoint
  describe.skip('GET /corporations/:id/battles', () => {
    it('should return battles for a corporation', async () => {
      // Arrange
      const corpId = '98605706'; // Test Corp ID

      const response = await server.inject({
        method: 'GET',
        url: `/corporations/${corpId}/battles`,
      });

      // Assert
      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('items');
        expect(Array.isArray(body.items)).toBe(true);
      }
    });
  });

  // TODO: Implement /characters/:id/battles endpoint
  describe.skip('GET /characters/:id/battles', () => {
    it('should return battles for a character', async () => {
      // Arrange
      const characterId = '2119887125'; // Test Character ID

      const response = await server.inject({
        method: 'GET',
        url: `/characters/${characterId}/battles`,
      });

      // Assert
      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('items');
        expect(Array.isArray(body.items)).toBe(true);
      }
    });
  });

  // TODO: Implement /search endpoint (currently /search/entities exists)
  describe.skip('GET /search', () => {
    it('should search for entities', async () => {
      // Arrange
      const query = 'Goonswarm';

      const response = await server.inject({
        method: 'GET',
        url: `/search?q=${encodeURIComponent(query)}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('results');
      expect(Array.isArray(body.results)).toBe(true);
    });

    it('should require query parameter', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/search',
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it('should respect limit parameter', async () => {
      // Arrange
      const limit = 5;
      const response = await server.inject({
        method: 'GET',
        url: `/search?q=test&limit=${limit}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.results.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('Response Schema Validation', () => {
    it('should return proper error response format on 404', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/battles/00000000-0000-0000-0000-000000000000',
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('statusCode', 404);
    });

    it('should return proper error response format on 400', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/battles?limit=invalid',
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('statusCode', 400);
    });
  });

  describe('Content-Type Headers', () => {
    it('should return application/json for JSON responses', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/battles',
      });

      // Assert
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return text/event-stream for SSE endpoints', async () => {
      // Arrange
      const response = await server.inject({
        method: 'GET',
        url: '/killmails/stream',
      });

      // Assert - either 200 with event-stream or redirect/error
      if (response.statusCode === 200) {
        expect(response.headers['content-type']).toContain('text/event-stream');
      }
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers', async () => {
      // Arrange
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/battles',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'GET',
        },
      });

      // Assert
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });
});
