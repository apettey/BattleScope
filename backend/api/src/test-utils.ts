/**
 * Mock utilities for testing and OpenAPI generation
 */

import type {
  BattleRepository,
  KillmailRepository,
  RulesetRepository,
  DashboardRepository,
  DatabaseClient,
} from '@battlescope/database';
import type { NameEnricher } from './services/name-enricher.js';

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

  return {
    battleRepository: mockBattleRepository,
    killmailRepository: mockKillmailRepository,
    rulesetRepository: mockRulesetRepository,
    dashboardRepository: mockDashboardRepository,
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
  } as NameEnricher;
};
