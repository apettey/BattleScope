import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomUUID } from 'crypto';
import {
  BattleRepository,
  KillmailEnrichmentRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  AccountRepository,
  CharacterRepository,
  FeatureRepository,
  AuthConfigRepository,
  AuditLogRepository,
} from '@battlescope/database';
import { createInMemoryDatabase } from '@battlescope/database/testing';
import type { KillmailEventInsert } from '@battlescope/database';
import type { EsiClient, UniverseName } from '@battlescope/esi-client';
import { buildServer } from '../src/server.js';
import type { ApiConfig } from '../src/config.js';
import { NameEnricher } from '../src/services/name-enricher.js';
import { createMockEsiClient, createMockSearchService } from '../src/test-utils.js';

const createNameEnricher = (): NameEnricher => {
  const cache = new Map<number, UniverseName>();
  const client = {
    async getUniverseNames(ids: readonly number[]) {
      const result = new Map<number, UniverseName>();
      for (const id of ids) {
        let entry = cache.get(id);
        if (!entry) {
          entry = { id, name: `Name ${id}`, category: 'alliance' } as UniverseName;
          cache.set(id, entry);
        }
        result.set(id, entry);
      }
      return result;
    },
  };

  return new NameEnricher(client as unknown as EsiClient);
};

const createBattle = async (
  battleRepository: BattleRepository,
  killmailRepository: KillmailRepository,
  battleId: string,
  killmailBase: KillmailEventInsert,
  overrides?: Partial<KillmailEventInsert>,
) => {
  const killmail: KillmailEventInsert = { ...killmailBase, ...overrides };
  await killmailRepository.insert(killmail);

  await battleRepository.createBattle({
    id: battleId,
    systemId: killmail.systemId,
    spaceType: 'jspace',
    startTime: killmail.occurredAt,
    endTime: new Date(killmail.occurredAt.getTime() + 5 * 60 * 1000),
    totalKills: 1n,
    totalIskDestroyed: killmail.iskValue ?? 0n,
    zkillRelatedUrl: `https://zkillboard.com/related/${killmail.systemId}/${killmail.occurredAt
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '')
      .slice(0, 12)}/`,
  });

  await battleRepository.upsertKillmails([
    {
      battleId,
      killmailId: killmail.killmailId,
      zkbUrl: killmail.zkbUrl,
      occurredAt: killmail.occurredAt,
      victimAllianceId: killmail.victimAllianceId,
      attackerAllianceIds: killmail.attackerAllianceIds,
      iskValue: killmail.iskValue,
      sideId: null,
    },
  ]);

  await killmailRepository.markAsProcessed([killmail.killmailId], battleId);
};

describe('API routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: FastifyInstance<any, any, any, any, ZodTypeProvider>;
  let db: Awaited<ReturnType<typeof createInMemoryDatabase>>;
  let battleRepository: BattleRepository;
  let killmailRepository: KillmailRepository;
  let rulesetRepository: RulesetRepository;
  let firstBattleId: string;
  let secondBattleId: string;
  const baseConfig: ApiConfig = {
    port: 3000,
    host: '0.0.0.0',
    developerMode: false,
    corsAllowedOrigins: [],
    esiBaseUrl: 'https://esi.evetech.net/latest/',
    esiDatasource: 'tranquility',
    esiCompatibilityDate: '2025-09-30',
    esiTimeoutMs: 10_000,
    esiCacheTtlSeconds: 300,
    esiRedisCacheUrl: undefined,
    typesenseHost: 'localhost',
    typesensePort: 8108,
    typesenseProtocol: 'http',
    typesenseApiKey: 'test-key',
    eveClientId: 'test-client-id',
    eveClientSecret: 'test-client-secret',
    eveCallbackUrl: 'http://localhost:3000/auth/callback',
    eveScopes: ['publicData'],
    encryptionKey: 'test-encryption-key-32-characters-long',
    sessionTtlSeconds: 2592000,
    sessionCookieName: 'battlescope_session',
    sessionCookieSecure: false,
    authzCacheTtlSeconds: 60,
    frontendUrl: 'http://localhost:5173',
  };
  let nameEnricher: NameEnricher;

  beforeAll(async () => {
    db = await createInMemoryDatabase();
    battleRepository = new BattleRepository(db.db);
    killmailRepository = new KillmailRepository(db.db);
    rulesetRepository = new RulesetRepository(db.db);
    const dashboardRepository = new DashboardRepository(db.db);
    const enrichmentRepository = new KillmailEnrichmentRepository(db.db);

    const baseKillmail = {
      killmailId: 1001n,
      systemId: 31000123n,
      occurredAt: new Date('2024-05-01T10:00:00Z'),
      victimAllianceId: 99001234n,
      victimCorpId: 12345n,
      victimCharacterId: 700_000_001n,
      attackerAllianceIds: [99002345n],
      attackerCorpIds: [67890n],
      attackerCharacterIds: [800_000_002n],
      iskValue: 400_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/1001/',
    };

    firstBattleId = randomUUID();
    await createBattle(battleRepository, killmailRepository, firstBattleId, baseKillmail);

    await enrichmentRepository.markSucceeded(
      baseKillmail.killmailId,
      { source: 'fixture' },
      new Date('2024-05-01T10:01:00Z'),
    );

    secondBattleId = randomUUID();
    await killmailRepository.insert({
      killmailId: 2001n,
      systemId: 30000111n,
      occurredAt: new Date('2024-05-02T15:00:00Z'),
      victimAllianceId: 99003333n,
      victimCorpId: 54321n,
      victimCharacterId: 700_000_100n,
      attackerAllianceIds: [99004444n],
      attackerCorpIds: [11111n],
      attackerCharacterIds: [800_000_200n],
      iskValue: 125_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/2001/',
    });

    await battleRepository.createBattle({
      id: secondBattleId,
      systemId: 30000111n,
      spaceType: 'kspace',
      startTime: new Date('2024-05-02T15:00:00Z'),
      endTime: new Date('2024-05-02T15:10:00Z'),
      totalKills: 1n,
      totalIskDestroyed: 125_000_000n,
      zkillRelatedUrl: 'https://zkillboard.com/related/30000111/202405021500/',
    });

    await battleRepository.upsertKillmails([
      {
        battleId: secondBattleId,
        killmailId: 2001n,
        zkbUrl: 'https://zkillboard.com/kill/2001/',
        occurredAt: new Date('2024-05-02T15:00:00Z'),
        victimAllianceId: 99003333n,
        attackerAllianceIds: [99004444n],
        iskValue: 125_000_000n,
        sideId: null,
      },
    ]);

    await killmailRepository.markAsProcessed([2001n], secondBattleId);
    await enrichmentRepository.markFailed(2001n, 'timeout');

    // Create auth repositories
    const accountRepository = new AccountRepository(db.db);
    const characterRepository = new CharacterRepository(db.db);
    const featureRepository = new FeatureRepository(db.db);
    const authConfigRepository = new AuthConfigRepository(db.db);
    const auditLogRepository = new AuditLogRepository(db.db);

    // Create mock ESI client but NOT auth services to disable auth middleware
    const mockEsiClient = createMockEsiClient();

    nameEnricher = createNameEnricher();
    app = buildServer({
      battleRepository,
      killmailRepository,
      rulesetRepository,
      dashboardRepository,
      accountRepository,
      characterRepository,
      featureRepository,
      authConfigRepository,
      auditLogRepository,
      db: db.db,
      config: baseConfig,
      nameEnricher,
      esiClient: mockEsiClient,
      searchService: createMockSearchService(),
      // Auth services NOT provided to disable authentication for these tests
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  it('returns ok for healthz', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('lists battles with pagination cursor', async () => {
    const response = await app.inject({ method: 'GET', url: '/battles?limit=1' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      zkillRelatedUrl: expect.stringContaining('https://zkillboard.com/related/'),
    });
    expect(body.items[0].systemName).toBe(`Name ${body.items[0].systemId}`);
    expect(body.nextCursor).toBeTruthy();
  });

  it('filters battles by alliance id', async () => {
    const response = await app.inject({ method: 'GET', url: '/battles?allianceId=99001234' });
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].systemId).toBe('31000123');
  });

  it('returns battles for a character', async () => {
    const response = await app.inject({ method: 'GET', url: '/characters/700000001/battles' });
    const body = response.json();
    expect(body.items).toHaveLength(1);
  });

  it('returns battle detail with killmail references', async () => {
    const response = await app.inject({ method: 'GET', url: `/battles/${firstBattleId}` });
    expect(response.statusCode).toBe(200);
    const detail = response.json();
    const killmail = detail.killmails.find(
      (km: { killmailId: string }) => km.killmailId === '1001',
    );
    expect(killmail).toMatchObject({
      killmailId: '1001',
      zkbUrl: expect.stringContaining('/kill/'),
      iskValue: expect.any(String),
      attackerCharacterIds: expect.arrayContaining([expect.any(String)]),
      victimAllianceId: '99001234',
      victimAllianceName: 'Name 99001234',
    });
  });

  it('includes killmail enrichment metadata', async () => {
    const response = await app.inject({ method: 'GET', url: `/battles/${firstBattleId}` });
    expect(response.statusCode).toBe(200);
    const detail = response.json();
    const enrichment = detail.killmails[0].enrichment;
    expect(enrichment).toMatchObject({
      status: 'succeeded',
      error: null,
      payload: { source: 'fixture' },
    });
    expect(enrichment?.updatedAt).toEqual(expect.any(String));
    expect(new Date(enrichment?.updatedAt as string).toString()).not.toBe('Invalid Date');
  });

  it('surfaces enrichment failures for killmails without payload', async () => {
    const response = await app.inject({ method: 'GET', url: `/battles/${secondBattleId}` });
    expect(response.statusCode).toBe(200);
    const detail = response.json();
    expect(detail.killmails[0].enrichment).toMatchObject({
      status: 'failed',
      error: 'timeout',
      payload: null,
    });
  });

  // Ruleset API endpoints re-enabled
  it('returns ruleset defaults', async () => {
    const response = await app.inject({ method: 'GET', url: '/rulesets/current' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      id: expect.any(String),
      minPilots: 1,
      trackedAllianceIds: [],
      trackedCorpIds: [],
      ignoreUnlisted: false,
    });
    expect(body.trackedAllianceNames).toEqual(
      body.trackedAllianceIds.map((id: string) => `Name ${id}`),
    );
    expect(body.trackedCorpNames).toEqual(body.trackedCorpIds.map((id: string) => `Name ${id}`));
  });

  it('updates ruleset configuration', async () => {
    const payload = {
      minPilots: 2,
      trackedAllianceIds: ['99001234'],
      trackedCorpIds: ['12345'],
      ignoreUnlisted: true,
      updatedBy: 'vitest',
    };

    const response = await app.inject({
      method: 'PUT',
      url: '/rulesets/current',
      payload,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      minPilots: 2,
      ignoreUnlisted: true,
      trackedAllianceIds: ['99001234'],
      trackedCorpIds: ['12345'],
      updatedBy: 'vitest',
    });
    expect(body.trackedAllianceNames).toEqual(
      body.trackedAllianceIds.map((id: string) => `Name ${id}`),
    );
    expect(body.trackedCorpNames).toEqual(body.trackedCorpIds.map((id: string) => `Name ${id}`));

    // revert to default for other tests
    await rulesetRepository.updateActiveRuleset({
      minPilots: 1,
      trackedAllianceIds: [],
      trackedCorpIds: [],
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: false,
      updatedBy: null,
    });
  });

  it('provides recent killmail feed data with filtering', async () => {
    const response = await app.inject({ method: 'GET', url: '/killmails/recent?limit=5' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.items[0]).toMatchObject({
      killmailId: '2001',
      spaceType: 'kspace',
    });
    expect(body.items[0].systemName).toBe(`Name ${body.items[0].systemId}`);
    expect(body.items[0].attackerAllianceNames).toContain('Name 99004444');

    const filtered = await app.inject({ method: 'GET', url: '/killmails/recent?spaceType=jspace' });
    const filteredBody = filtered.json();
    expect(filteredBody.items).toHaveLength(1);
    expect(filteredBody.items[0].killmailId).toBe('1001');
  });

  it('applies tracked-only filtering when rules enforce allowlists', async () => {
    await rulesetRepository.updateActiveRuleset({
      minPilots: 1,
      trackedAllianceIds: [99001234n],
      trackedCorpIds: [],
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: true,
      updatedBy: 'test-tracked',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/killmails/recent?trackedOnly=true',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].killmailId).toBe('1001');

    await rulesetRepository.updateActiveRuleset({
      minPilots: 1,
      trackedAllianceIds: [],
      trackedCorpIds: [],
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: false,
      updatedBy: null,
    });
  });

  it('streams killmail updates via SSE snapshot', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/killmails/stream?once=true&limit=1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    const blocks = response.body.trim().split('\n\n');
    expect(blocks[0]).toContain('event: snapshot');
    const dataLine = blocks[0].split('\n').find((line) => line.startsWith('data:'));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice('data: '.length));
    expect(Array.isArray(payload)).toBe(true);
    expect(payload[0].killmailId).toBe('2001');
  });

  it('includes CORS headers on killmail stream responses for allowed origins', async () => {
    const corsApp = buildServer({
      battleRepository,
      killmailRepository,
      rulesetRepository,
      dashboardRepository: new DashboardRepository(db.db),
      accountRepository: new AccountRepository(db.db),
      characterRepository: new CharacterRepository(db.db),
      featureRepository: new FeatureRepository(db.db),
      authConfigRepository: new AuthConfigRepository(db.db),
      auditLogRepository: new AuditLogRepository(db.db),
      db: db.db,
      config: {
        ...baseConfig,
        corsAllowedOrigins: ['https://app.example.com'],
      },
      nameEnricher: createNameEnricher(),
      esiClient: createMockEsiClient(),
      searchService: createMockSearchService(),
      // No auth services to disable authentication
    });
    await corsApp.ready();

    const response = await corsApp.inject({
      method: 'GET',
      url: '/killmails/stream?once=true&limit=1',
      headers: {
        origin: 'https://app.example.com',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    await corsApp.close();
  });

  it('includes CORS headers on killmail stream responses in developer mode for localhost', async () => {
    const devApp = buildServer({
      battleRepository,
      killmailRepository,
      rulesetRepository,
      dashboardRepository: new DashboardRepository(db.db),
      accountRepository: new AccountRepository(db.db),
      characterRepository: new CharacterRepository(db.db),
      featureRepository: new FeatureRepository(db.db),
      authConfigRepository: new AuthConfigRepository(db.db),
      auditLogRepository: new AuditLogRepository(db.db),
      db: db.db,
      config: {
        ...baseConfig,
        developerMode: true,
      },
      nameEnricher: createNameEnricher(),
      esiClient: createMockEsiClient(),
      searchService: createMockSearchService(),
      // No auth services to disable authentication
    });
    await devApp.ready();

    const response = await devApp.inject({
      method: 'GET',
      url: '/killmails/stream?once=true&limit=1',
      headers: {
        origin: 'http://localhost:5173',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    await devApp.close();
  });

  it('includes CORS headers on standard responses in developer mode for localhost', async () => {
    const devApp = buildServer({
      battleRepository,
      killmailRepository,
      rulesetRepository,
      dashboardRepository: new DashboardRepository(db.db),
      accountRepository: new AccountRepository(db.db),
      characterRepository: new CharacterRepository(db.db),
      featureRepository: new FeatureRepository(db.db),
      authConfigRepository: new AuthConfigRepository(db.db),
      auditLogRepository: new AuditLogRepository(db.db),
      db: db.db,
      config: {
        ...baseConfig,
        developerMode: true,
      },
      nameEnricher: createNameEnricher(),
      esiClient: createMockEsiClient(),
      searchService: createMockSearchService(),
      // No auth services to disable authentication
    });
    await devApp.ready();

    const response = await devApp.inject({
      method: 'GET',
      url: '/killmails/recent?limit=1',
      headers: {
        origin: 'http://127.0.0.1:4200',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:4200');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    const varyHeader = response.headers['vary'];
    expect(varyHeader).toBeDefined();
    if (Array.isArray(varyHeader)) {
      expect(varyHeader.map((value) => value.toLowerCase())).toContain('origin');
    } else {
      expect((varyHeader as string).toLowerCase()).toContain('origin');
    }
    await devApp.close();
  });

  it('returns dashboard statistics summary', async () => {
    const response = await app.inject({ method: 'GET', url: '/stats/summary' });
    expect(response.statusCode).toBe(200);
    const summary = response.json();
    expect(summary).toMatchObject({
      totalBattles: 2,
      totalKillmails: expect.any(Number),
      uniqueAlliances: expect.any(Number),
      uniqueCorporations: expect.any(Number),
      topAlliances: expect.any(Array),
      topCorporations: expect.any(Array),
    });
    expect(summary.topAlliances[0]?.allianceName).toMatch(/^Name /);
  });

  it('allows cross-origin requests when no allowlist is configured', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: {
        origin: 'https://example.com',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
  });

  it('sends CORS headers on simple requests for configured origins', async () => {
    const corsApp = buildServer({
      battleRepository,
      killmailRepository,
      rulesetRepository,
      dashboardRepository: new DashboardRepository(db.db),
      accountRepository: new AccountRepository(db.db),
      characterRepository: new CharacterRepository(db.db),
      featureRepository: new FeatureRepository(db.db),
      authConfigRepository: new AuthConfigRepository(db.db),
      auditLogRepository: new AuditLogRepository(db.db),
      db: db.db,
      config: {
        ...baseConfig,
        corsAllowedOrigins: ['https://app.example.com'],
      },
      nameEnricher: createNameEnricher(),
      esiClient: createMockEsiClient(),
      searchService: createMockSearchService(),
      // No auth services to disable authentication
    });
    await corsApp.ready();

    const response = await corsApp.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        origin: 'https://app.example.com',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
    await corsApp.close();
  });

  it('allows localhost origins when developer mode is enabled', async () => {
    const devApp = buildServer({
      battleRepository,
      killmailRepository,
      rulesetRepository,
      dashboardRepository: new DashboardRepository(db.db),
      accountRepository: new AccountRepository(db.db),
      characterRepository: new CharacterRepository(db.db),
      featureRepository: new FeatureRepository(db.db),
      authConfigRepository: new AuthConfigRepository(db.db),
      auditLogRepository: new AuditLogRepository(db.db),
      db: db.db,
      config: { ...baseConfig, developerMode: true },
      nameEnricher: createNameEnricher(),
      esiClient: createMockEsiClient(),
      searchService: createMockSearchService(),
      // No auth services to disable authentication
    });
    await devApp.ready();

    const response = await devApp.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    await devApp.close();
  });

  it('blocks disallowed origins when allowlist is configured', async () => {
    const restrictedApp = buildServer({
      battleRepository,
      killmailRepository,
      rulesetRepository,
      dashboardRepository: new DashboardRepository(db.db),
      accountRepository: new AccountRepository(db.db),
      characterRepository: new CharacterRepository(db.db),
      featureRepository: new FeatureRepository(db.db),
      authConfigRepository: new AuthConfigRepository(db.db),
      auditLogRepository: new AuditLogRepository(db.db),
      db: db.db,
      config: { ...baseConfig, corsAllowedOrigins: ['https://app.example.com'] },
      nameEnricher: createNameEnricher(),
      esiClient: createMockEsiClient(),
      searchService: createMockSearchService(),
      // No auth services to disable authentication
    });
    await restrictedApp.ready();

    const allowedResponse = await restrictedApp.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: {
        origin: 'https://app.example.com',
        'access-control-request-method': 'GET',
      },
    });

    expect(allowedResponse.headers['access-control-allow-origin']).toBe('https://app.example.com');

    const blockedResponse = await restrictedApp.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: {
        origin: 'https://blocked.example.com',
        'access-control-request-method': 'GET',
      },
    });

    expect(blockedResponse.headers['access-control-allow-origin']).toBeUndefined();
    await restrictedApp.close();
  });
});
