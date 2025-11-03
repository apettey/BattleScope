import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BattleRepository, KillmailRepository } from '@battlescope/database';
import { ClusteringEngine } from '../src/engine.js';
import { ClustererService } from '../src/service.js';
import { createTestDb } from './helpers.js';

const baseReference = {
  systemId: 30000142n,
  victimAllianceId: 99001234n,
  victimCorpId: 12345n,
  victimCharacterId: 555_666_777n,
  attackerAllianceIds: [99004567n],
  attackerCorpIds: [98765n],
  attackerCharacterIds: [222_333_444n],
  iskValue: 100_000_000n,
  zkbUrl: 'https://zkillboard.com/kill/1/',
};

describe('ClustererService', () => {
  const engine = new ClusteringEngine({ windowMinutes: 30, gapMaxMinutes: 15, minKills: 2 });
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  let battleRepository: BattleRepository;
  let killmailRepository: KillmailRepository;
  let service: ClustererService;

  beforeEach(async () => {
    testDb = await createTestDb();
    battleRepository = new BattleRepository(testDb.db);
    killmailRepository = new KillmailRepository(testDb.db);
    service = new ClustererService(battleRepository, killmailRepository, engine);
  });

  afterEach(async () => {
    await testDb.destroy();
  });

  it('clusters killmails into battles meeting minimum size', async () => {
    await killmailRepository.insert({
      killmailId: 1n,
      occurredAt: new Date('2024-05-01T12:00:00Z'),
      fetchedAt: new Date('2024-05-01T12:05:00Z'),
      ...baseReference,
    });
    await killmailRepository.insert({
      killmailId: 2n,
      occurredAt: new Date('2024-05-01T12:04:00Z'),
      fetchedAt: new Date('2024-05-01T12:05:30Z'),
      ...baseReference,
      attackerAllianceIds: [99002345n],
      zkbUrl: 'https://zkillboard.com/kill/2/',
    });

    const stats = await service.processBatch(10);
    expect(stats.battles).toBe(1);
    expect(stats.processedKillmails).toBe(2);

    const battles = await testDb.db.selectFrom('battles').selectAll().execute();
    expect(battles).toHaveLength(1);
    expect(BigInt(battles[0].totalKills)).toBe(2n);

    const events = await killmailRepository.fetchUnprocessed();
    expect(events).toHaveLength(0);
  });

  it('marks killmails below threshold as ignored without creating battles', async () => {
    await killmailRepository.insert({
      killmailId: 3n,
      occurredAt: new Date('2024-05-01T13:00:00Z'),
      fetchedAt: new Date('2024-05-01T13:05:00Z'),
      ...baseReference,
      zkbUrl: 'https://zkillboard.com/kill/3/',
    });

    const stats = await service.processBatch(10);
    expect(stats.battles).toBe(0);
    expect(stats.ignored).toBe(1);

    const events = await killmailRepository.fetchUnprocessed();
    expect(events).toHaveLength(0);
  });
});
