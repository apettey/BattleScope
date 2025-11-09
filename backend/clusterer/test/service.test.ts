import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BattleRepository, KillmailRepository } from '@battlescope/database';
import { ClusteringEngine, ClustererService } from '@battlescope/battle-reports';
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
    service = new ClustererService(battleRepository, killmailRepository, engine, 0);
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

    const events = await killmailRepository.fetchUnprocessed(500, 0);
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

    const events = await killmailRepository.fetchUnprocessed(500, 0);
    expect(events).toHaveLength(0);
  });

  it('respects processing delay - does not process recent killmails', async () => {
    // Create a service with explicit delay
    const delayedService = new ClustererService(
      battleRepository,
      killmailRepository,
      engine,
      30, // 30 minute processing delay
    );

    const now = new Date();
    const recentKillmail = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago

    await killmailRepository.insert({
      killmailId: 100n,
      occurredAt: recentKillmail,
      fetchedAt: now,
      ...baseReference,
      zkbUrl: 'https://zkillboard.com/kill/100/',
    });

    // Service configured with 30 minute delay
    const stats = await delayedService.processBatch(10);

    // Should not process because killmail is too recent
    expect(stats.processedKillmails).toBe(0);
    expect(stats.battles).toBe(0);

    const unprocessed = await killmailRepository.fetchUnprocessed(500, 0);
    expect(unprocessed).toHaveLength(1);
  });

  it('processes old killmails after processing delay has elapsed', async () => {
    const now = new Date();
    const oldKillmail = new Date(now.getTime() - 60 * 60 * 1000); // 60 minutes ago

    await killmailRepository.insert({
      killmailId: 101n,
      occurredAt: oldKillmail,
      fetchedAt: new Date(oldKillmail.getTime() + 5000),
      ...baseReference,
      zkbUrl: 'https://zkillboard.com/kill/101/',
    });
    await killmailRepository.insert({
      killmailId: 102n,
      occurredAt: new Date(oldKillmail.getTime() + 2 * 60 * 1000),
      fetchedAt: new Date(oldKillmail.getTime() + 2 * 60 * 1000 + 5000),
      ...baseReference,
      attackerAllianceIds: [99002345n],
      zkbUrl: 'https://zkillboard.com/kill/102/',
    });

    const stats = await service.processBatch(10);

    // Should process both killmails
    expect(stats.processedKillmails).toBe(2);
    expect(stats.battles).toBe(1);

    const battles = await testDb.db.selectFrom('battles').selectAll().execute();
    expect(battles).toHaveLength(1);
  });

  it('handles alliance correlation across time gap correctly', async () => {
    const baseTime = new Date('2024-05-01T14:00:00Z');

    // Two kills 20 minutes apart (exceeds gap) but share alliances
    await killmailRepository.insert({
      killmailId: 201n,
      occurredAt: baseTime,
      fetchedAt: new Date(baseTime.getTime() + 5000),
      victimAllianceId: 99001111n,
      attackerAllianceIds: [99002222n],
      victimCorpId: 12345n,
      victimCharacterId: 555_666_777n,
      attackerCorpIds: [98765n],
      attackerCharacterIds: [222_333_444n],
      systemId: 30000142n,
      iskValue: 100_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/201/',
    });
    await killmailRepository.insert({
      killmailId: 202n,
      occurredAt: new Date(baseTime.getTime() + 20 * 60 * 1000), // 20 minutes later
      fetchedAt: new Date(baseTime.getTime() + 20 * 60 * 1000 + 5000),
      victimAllianceId: 99002222n,
      attackerAllianceIds: [99001111n],
      victimCorpId: 12345n,
      victimCharacterId: 555_666_778n,
      attackerCorpIds: [98765n],
      attackerCharacterIds: [222_333_445n],
      systemId: 30000142n,
      iskValue: 150_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/202/',
    });

    const stats = await service.processBatch(10);

    // Should cluster due to alliance correlation
    expect(stats.battles).toBe(1);
    expect(stats.processedKillmails).toBe(2);

    const battles = await testDb.db.selectFrom('battles').selectAll().execute();
    expect(battles).toHaveLength(1);
    expect(BigInt(battles[0].totalKills)).toBe(2n);
    expect(BigInt(battles[0].totalIskDestroyed)).toBe(250_000_000n);
  });

  it('creates separate battles for different systems', async () => {
    const baseTime = new Date('2024-05-01T15:00:00Z');

    // Battle in system A (different alliances than baseReference)
    await killmailRepository.insert({
      killmailId: 301n,
      occurredAt: baseTime,
      fetchedAt: new Date(baseTime.getTime() + 5000),
      systemId: 30000142n,
      victimAllianceId: 99005555n,
      victimCorpId: 12345n,
      victimCharacterId: 555_666_777n,
      attackerAllianceIds: [99006666n],
      attackerCorpIds: [98765n],
      attackerCharacterIds: [222_333_444n],
      iskValue: 100_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/301/',
    });
    await killmailRepository.insert({
      killmailId: 302n,
      occurredAt: new Date(baseTime.getTime() + 3 * 60 * 1000),
      fetchedAt: new Date(baseTime.getTime() + 3 * 60 * 1000 + 5000),
      systemId: 30000142n,
      victimAllianceId: 99006666n,
      victimCorpId: 12346n,
      victimCharacterId: 555_666_778n,
      attackerAllianceIds: [99005555n],
      attackerCorpIds: [98766n],
      attackerCharacterIds: [222_333_445n],
      iskValue: 150_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/302/',
    });

    // Battle in system B (different alliances than both A and baseReference)
    await killmailRepository.insert({
      killmailId: 303n,
      occurredAt: new Date(baseTime.getTime() + 1 * 60 * 1000),
      fetchedAt: new Date(baseTime.getTime() + 1 * 60 * 1000 + 5000),
      systemId: 30000143n,
      victimAllianceId: 99007777n,
      victimCorpId: 12347n,
      victimCharacterId: 555_666_779n,
      attackerAllianceIds: [99008888n],
      attackerCorpIds: [98767n],
      attackerCharacterIds: [222_333_446n],
      iskValue: 200_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/303/',
    });
    await killmailRepository.insert({
      killmailId: 304n,
      occurredAt: new Date(baseTime.getTime() + 4 * 60 * 1000),
      fetchedAt: new Date(baseTime.getTime() + 4 * 60 * 1000 + 5000),
      systemId: 30000143n,
      victimAllianceId: 99008888n,
      victimCorpId: 12348n,
      victimCharacterId: 555_666_780n,
      attackerAllianceIds: [99007777n],
      attackerCorpIds: [98768n],
      attackerCharacterIds: [222_333_447n],
      iskValue: 250_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/304/',
    });

    const stats = await service.processBatch(10);

    // Should create two separate battles
    expect(stats.battles).toBe(2);
    expect(stats.processedKillmails).toBe(4);

    const battles = await testDb.db.selectFrom('battles').selectAll().execute();
    expect(battles).toHaveLength(2);

    // Verify each battle has correct system
    const systemIds = battles.map((b) => b.systemId.toString()).sort();
    expect(systemIds).toEqual(['30000142', '30000143']);
  });
});
