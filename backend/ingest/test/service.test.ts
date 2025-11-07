import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KillmailRepository, RulesetRepository, type RulesetRecord } from '@battlescope/database';
import type { SystemSecurityResolver, SecurityType } from '@battlescope/shared';
import { IngestionService } from '../src/service.js';
import { MockKillmailSource } from '../src/source.js';
import { createTestDb } from './helpers.js';
import type { RulesetCache } from '../src/ruleset-cache.js';

/**
 * In-memory cache for testing
 */
class InMemoryRulesetCache implements RulesetCache {
  private ruleset: RulesetRecord | null = null;

  constructor(private readonly repository: RulesetRepository) {}

  async get(): Promise<RulesetRecord> {
    if (!this.ruleset) {
      this.ruleset = await this.repository.getActiveRuleset();
    }
    return this.ruleset;
  }

  async invalidate(): Promise<void> {
    this.ruleset = null;
  }

  async close(): Promise<void> {
    // no-op
  }
}

/**
 * Mock system security resolver for testing
 */
const createMockSystemSecurityResolver = (): SystemSecurityResolver => {
  const mockEsiClient = {
    getSystemInfo: vi.fn().mockResolvedValue({ security_status: 0.9 }),
  };
  const mock: SystemSecurityResolver = {
    getSecurityType: vi.fn().mockResolvedValue('highsec' as SecurityType),
    getSecurityTypes: vi.fn().mockResolvedValue(new Map<bigint, SecurityType>()),
    invalidateCache: vi.fn().mockResolvedValue(undefined),
    esiClient: mockEsiClient,
    getCacheKey: vi.fn().mockReturnValue('test-cache-key'),
  } as unknown as SystemSecurityResolver;
  return mock;
};

const reference = {
  killmailId: 9001n,
  systemId: 30000142n,
  occurredAt: new Date('2024-05-01T12:00:00Z'),
  victimAllianceId: 99001234n,
  victimCorpId: 12345n,
  victimCharacterId: 777_888_999n,
  attackerAllianceIds: [99004567n, 99002345n],
  attackerCorpIds: [45678n],
  attackerCharacterIds: [111_222_333n],
  iskValue: 750_000_000n,
  zkbUrl: 'https://zkillboard.com/kill/9001/',
};

describe('IngestionService', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let killmailRepository: KillmailRepository;
  let rulesetRepository: RulesetRepository;

  beforeAll(async () => {
    db = await createTestDb();
    killmailRepository = new KillmailRepository(db.db);
    rulesetRepository = new RulesetRepository(db.db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('stores killmail references and deduplicates', async () => {
    const cache = new InMemoryRulesetCache(rulesetRepository);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new IngestionService(
      killmailRepository,
      cache,
      new MockKillmailSource([reference, reference]),
      createMockSystemSecurityResolver(),
      { enqueue },
    );

    const first = await service.processNext();
    const second = await service.processNext();
    const third = await service.processNext();

    expect(first).toBe('stored');
    expect(second).toBe('duplicate');
    expect(third).toBe('empty');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(reference.killmailId);

    const remaining = await killmailRepository.fetchUnprocessed(500, 0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].killmailId).toBe(reference.killmailId);
  });

  it('filters killmails below minimum pilot threshold', async () => {
    // Set minimum pilots to 5 (our reference has 2 pilots)
    await rulesetRepository.updateActiveRuleset({
      minPilots: 5,
      trackedAllianceIds: [],
      trackedCorpIds: [],
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: false,
      updatedBy: 'test',
    });

    const cache = new InMemoryRulesetCache(rulesetRepository);
    const filteredKillmail = { ...reference, killmailId: 9010n };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new IngestionService(
      killmailRepository,
      cache,
      new MockKillmailSource([filteredKillmail]),
      createMockSystemSecurityResolver(),
      { enqueue },
    );

    const result = await service.processNext();

    expect(result).toBe('filtered');
    expect(enqueue).not.toHaveBeenCalled();

    // Verify the filtered killmail was not stored
    const all = await killmailRepository.fetchUnprocessed(500, 0);
    const hasFilteredKillmail = all.some((k) => k.killmailId === 9010n);
    expect(hasFilteredKillmail).toBe(false);
  });

  it('filters killmails not in tracked alliances when ignoreUnlisted is true', async () => {
    // Track only alliance 88888888n (not in our reference)
    await rulesetRepository.updateActiveRuleset({
      minPilots: 1,
      trackedAllianceIds: [88888888n],
      trackedCorpIds: [],
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: true,
      updatedBy: 'test',
    });

    const cache = new InMemoryRulesetCache(rulesetRepository);
    const filteredKillmail = { ...reference, killmailId: 9011n };
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new IngestionService(
      killmailRepository,
      cache,
      new MockKillmailSource([filteredKillmail]),
      createMockSystemSecurityResolver(),
      { enqueue },
    );

    const result = await service.processNext();

    expect(result).toBe('filtered');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('accepts killmails in tracked alliances', async () => {
    // Track alliance that is in our reference
    await rulesetRepository.updateActiveRuleset({
      minPilots: 1,
      trackedAllianceIds: [99001234n], // victimAllianceId
      trackedCorpIds: [],
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: true,
      updatedBy: 'test',
    });

    const cache = new InMemoryRulesetCache(rulesetRepository);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new IngestionService(
      killmailRepository,
      cache,
      new MockKillmailSource([
        { ...reference, killmailId: 9002n }, // Use different ID to avoid duplicate
      ]),
      createMockSystemSecurityResolver(),
      { enqueue },
    );

    const result = await service.processNext();

    expect(result).toBe('stored');
    expect(enqueue).toHaveBeenCalledWith(9002n);
  });

  it('accepts killmails in tracked corporations', async () => {
    // Track corporation that is in our reference
    await rulesetRepository.updateActiveRuleset({
      minPilots: 1,
      trackedAllianceIds: [],
      trackedCorpIds: [45678n], // attackerCorpIds[0]
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: true,
      updatedBy: 'test',
    });

    const cache = new InMemoryRulesetCache(rulesetRepository);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new IngestionService(
      killmailRepository,
      cache,
      new MockKillmailSource([
        { ...reference, killmailId: 9003n }, // Use different ID to avoid duplicate
      ]),
      createMockSystemSecurityResolver(),
      { enqueue },
    );

    const result = await service.processNext();

    expect(result).toBe('stored');
    expect(enqueue).toHaveBeenCalledWith(9003n);
  });

  it('accepts all killmails when no tracking lists and ignoreUnlisted is false', async () => {
    await rulesetRepository.updateActiveRuleset({
      minPilots: 1,
      trackedAllianceIds: [],
      trackedCorpIds: [],
      trackedSystemIds: [],
      trackedSecurityTypes: [],
      ignoreUnlisted: false,
      updatedBy: 'test',
    });

    const cache = new InMemoryRulesetCache(rulesetRepository);
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new IngestionService(
      killmailRepository,
      cache,
      new MockKillmailSource([
        { ...reference, killmailId: 9004n }, // Use different ID to avoid duplicate
      ]),
      createMockSystemSecurityResolver(),
      { enqueue },
    );

    const result = await service.processNext();

    expect(result).toBe('stored');
    expect(enqueue).toHaveBeenCalledWith(9004n);
  });
});
