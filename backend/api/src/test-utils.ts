/**
 * Mock utilities for testing and OpenAPI generation
 */

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
import type {
  EVESSOService,
  SessionService,
  AuthorizationService,
  EncryptionService,
} from '@battlescope/auth';
import type { EsiClient } from '@battlescope/esi-client';
import type { NameEnricher } from './services/name-enricher.js';
import type { SearchService } from '@battlescope/search';

export const createMockDatabase = (): DatabaseClient => {
  return {
    selectFrom: () => ({
      select: () => ({
        limit: () => ({
          execute: async () => [],
        }),
      }),
    }),
  } as unknown as DatabaseClient;
};

export const createMockRepositories = () => {
  const mockBattleRepository: BattleRepository = {
    listBattles: async () => [],
    getBattleById: async () => null,
  } as unknown as BattleRepository;

  const mockKillmailRepository: KillmailRepository = {
    fetchRecentFeed: async () => [],
    fetchFeedSince: async () => [],
  } as unknown as KillmailRepository;

  const mockRulesetRepository: RulesetRepository = {
    getActiveRuleset: async () => ({
      id: 'mock-id',
      minPilots: 1,
      trackedAllianceIds: [],
      trackedCorpIds: [],
      ignoreUnlisted: false,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    updateActiveRuleset: async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any,
    ) => ({
      id: 'mock-id',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  } as unknown as RulesetRepository;

  const mockDashboardRepository: DashboardRepository = {
    getSummary: async () => ({
      totalBattles: 0,
      totalKillmails: 0,
      uniqueAlliances: 0,
      uniqueCorporations: 0,
      topAlliances: [],
      topCorporations: [],
      generatedAt: new Date(),
    }),
  } as unknown as DashboardRepository;

  const mockAccountRepository: AccountRepository = {
    create: async () => ({
      id: 'mock-account-id',
      displayName: 'Mock User',
      email: null,
      primaryCharacterId: null,
      isBlocked: false,
      isSuperAdmin: false,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getById: async () => null,
    list: async () => ({ accounts: [], total: 0 }),
  } as unknown as AccountRepository;

  const mockCharacterRepository: CharacterRepository = {
    create: async () => ({
      id: 'mock-char-id',
      accountId: 'mock-account-id',
      eveCharacterId: BigInt(1),
      eveCharacterName: 'Mock Character',
      corpId: BigInt(1),
      corpName: 'Mock Corp',
      allianceId: null,
      allianceName: null,
      portraitUrl: null,
      esiAccessToken: Buffer.from(''),
      esiRefreshToken: null,
      esiTokenExpiresAt: null,
      scopes: [],
      lastVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getByAccountId: async () => [],
  } as unknown as CharacterRepository;

  const mockFeatureRepository: FeatureRepository = {
    getAllFeatures: async () => [],
    getAccountFeatureRoles: async () => [],
  } as unknown as FeatureRepository;

  const mockAuthConfigRepository: AuthConfigRepository = {
    isCharacterAllowed: async () => true,
  } as unknown as AuthConfigRepository;

  const mockAuditLogRepository: AuditLogRepository = {
    create: async () => ({
      id: 'mock-audit-id',
      actorAccountId: 'mock-account-id',
      action: 'test.action',
      targetType: 'account',
      targetId: 'mock-target-id',
      metadata: null,
      createdAt: new Date(),
    }),
  } as unknown as AuditLogRepository;

  const mockShipHistoryRepository: PilotShipHistoryRepository = {
    getCharacterShipSummary: async () => [],
    getCharacterIskTotals: async () => ({
      totalIskDestroyed: 0n,
      totalIskLost: 0n,
      totalKills: 0,
      totalLosses: 0,
    }),
    getCharacterLosses: async () => [],
  } as unknown as PilotShipHistoryRepository;

  return {
    battleRepository: mockBattleRepository,
    killmailRepository: mockKillmailRepository,
    rulesetRepository: mockRulesetRepository,
    dashboardRepository: mockDashboardRepository,
    accountRepository: mockAccountRepository,
    characterRepository: mockCharacterRepository,
    featureRepository: mockFeatureRepository,
    authConfigRepository: mockAuthConfigRepository,
    auditLogRepository: mockAuditLogRepository,
    shipHistoryRepository: mockShipHistoryRepository,
  };
};

export const createMockNameEnricher = (): NameEnricher => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrichBattleSummaries: async (battles: any) => battles as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrichBattleDetail: async (battle: any) => battle as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrichKillmailFeed: async (items: any) => items as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrichDashboardSummary: async (summary: any) => summary as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrichRuleset: async (ruleset: any) => ruleset as any,
    enrichShipTypeIds: async () => new Map<bigint, string>(),
    enrichSystemIds: async () => new Map<bigint, string>(),
    enrichCharacterIds: async () => new Map<bigint, string>(),
    lookupNames: async () => new Map<string, string>(),
  } as unknown as NameEnricher;
};

export const createMockSearchService = (): SearchService => {
  return {
    autocompleteEntities: async () => ({
      alliances: [],
      corporations: [],
      characters: [],
      processingTimeMs: 0,
      query: '',
    }),
    autocompleteSystems: async () => ({
      systems: [],
      processingTimeMs: 0,
      query: '',
    }),
    searchBattles: async () => ({
      hits: [],
      estimatedTotalHits: 0,
      limit: 20,
      offset: 0,
      processingTimeMs: 0,
    }),
    searchGlobal: async () => ({
      battles: [],
      entities: { alliances: [], corporations: [], characters: [] },
      systems: [],
      processingTimeMs: 0,
      query: '',
      totalResults: { battles: 0, entities: 0, systems: 0 },
    }),
    getClient: () =>
      ({
        checkHealth: async () => ({
          healthy: true,
          latencyMs: 0,
          collections: { battles: true, entities: true, systems: true },
        }),
      }) as unknown,
  } as unknown as SearchService;
};

export const createMockEsiClient = (): EsiClient => {
  return {
    getCharacterInfo: async () => ({
      name: 'Mock Character',
      corporation_id: 1,
      alliance_id: null,
    }),
    getCorporationInfo: async () => ({
      name: 'Mock Corp',
      ticker: 'MOCK',
    }),
    getAllianceInfo: async () => ({
      name: 'Mock Alliance',
      ticker: 'MOCK',
    }),
    getCharacterPortraitUrl: () => 'https://images.evetech.net/characters/1/portrait',
  } as unknown as EsiClient;
};

export const createMockAuthServices = () => {
  const mockEncryptionService = {
    encrypt: () => 'encrypted',
    decrypt: () => 'decrypted',
    encryptToBuffer: () => Buffer.from('encrypted'),
    decryptFromBuffer: () => 'decrypted',
  } as unknown as EncryptionService;

  const mockEVESSOService: EVESSOService = {
    generateAuthorizationUrl: () => ({
      url: 'https://login.eveonline.com/oauth/authorize',
      state: 'mock-state',
    }),
    exchangeCodeForToken: async () => ({
      character: {
        CharacterID: 1,
        CharacterName: 'Mock Character',
        Scopes: 'publicData',
      },
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 1200,
    }),
    getRedirectUri: () => 'http://localhost:5173',
  } as unknown as EVESSOService;

  const mockSessionService: SessionService = {
    createSession: async () => 'mock-session-token',
    validateSession: async () => null,
    destroySession: async () => undefined,
    getCookieName: () => 'battlescope_session',
  } as unknown as SessionService;

  const mockAuthorizationService: AuthorizationService = {
    authorize: async () => ({ allowed: true }),
    invalidateCache: async () => undefined,
  } as unknown as AuthorizationService;

  return {
    encryptionService: mockEncryptionService,
    eveSSOService: mockEVESSOService,
    sessionService: mockSessionService,
    authorizationService: mockAuthorizationService,
  };
};

export const createMockBuildServerOptions = () => {
  return {
    ...createMockRepositories(),
    ...createMockAuthServices(),
    db: createMockDatabase(),
    esiClient: createMockEsiClient(),
    nameEnricher: createMockNameEnricher(),
    searchService: createMockSearchService(),
  };
};
