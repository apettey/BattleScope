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

  describe('retroactive killmail attribution', () => {
    it('attributes late-arriving killmail to existing battle within time window', async () => {
      const baseTime = new Date('2024-05-01T16:00:00Z');

      // Create initial battle with 2 kills
      await killmailRepository.insert({
        killmailId: 401n,
        occurredAt: baseTime,
        fetchedAt: new Date(baseTime.getTime() + 5000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/401/',
      });
      await killmailRepository.insert({
        killmailId: 402n,
        occurredAt: new Date(baseTime.getTime() + 5 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 5 * 60 * 1000 + 5000),
        ...baseReference,
        attackerAllianceIds: [99002345n],
        zkbUrl: 'https://zkillboard.com/kill/402/',
      });

      const stats1 = await service.processBatch(10);
      expect(stats1.battles).toBe(1);
      expect(stats1.processedKillmails).toBe(2);

      const battles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(battles).toHaveLength(1);
      const battleId = battles[0].id;
      expect(BigInt(battles[0].totalKills)).toBe(2n);

      // Late-arriving killmail with timestamp between the two existing kills
      await killmailRepository.insert({
        killmailId: 403n,
        occurredAt: new Date(baseTime.getTime() + 2 * 60 * 1000), // Between kill 401 and 402
        fetchedAt: new Date(baseTime.getTime() + 30 * 60 * 1000), // Arrives 30 mins late
        ...baseReference,
        attackerAllianceIds: [99002345n],
        zkbUrl: 'https://zkillboard.com/kill/403/',
      });

      const stats2 = await service.processBatch(10);
      expect(stats2.battles).toBe(0); // No new battle created
      expect(stats2.processedKillmails).toBe(1);

      // Verify battle was updated
      const updatedBattles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(updatedBattles).toHaveLength(1);
      expect(updatedBattles[0].id).toBe(battleId); // Same battle
      expect(BigInt(updatedBattles[0].totalKills)).toBe(3n); // Increased from 2 to 3

      // Verify all 3 killmails are in the battle
      const battleKillmails = await testDb.db
        .selectFrom('battle_killmails')
        .selectAll()
        .where('battleId', '=', battleId)
        .execute();
      expect(battleKillmails).toHaveLength(3);
    });

    it('extends battle time range when late killmail occurs outside existing range', async () => {
      const baseTime = new Date('2024-05-01T17:00:00Z');

      // Create initial battle
      await killmailRepository.insert({
        killmailId: 501n,
        occurredAt: new Date(baseTime.getTime() + 5 * 60 * 1000), // 17:05
        fetchedAt: new Date(baseTime.getTime() + 5 * 60 * 1000 + 5000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/501/',
      });
      await killmailRepository.insert({
        killmailId: 502n,
        occurredAt: new Date(baseTime.getTime() + 10 * 60 * 1000), // 17:10
        fetchedAt: new Date(baseTime.getTime() + 10 * 60 * 1000 + 5000),
        ...baseReference,
        attackerAllianceIds: [99002345n],
        zkbUrl: 'https://zkillboard.com/kill/502/',
      });

      await service.processBatch(10);
      const battles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(battles).toHaveLength(1);
      const originalStartTime = battles[0].startTime;
      const originalEndTime = battles[0].endTime;

      // Late killmail that occurred BEFORE the battle started
      await killmailRepository.insert({
        killmailId: 503n,
        occurredAt: new Date(baseTime.getTime() + 2 * 60 * 1000), // 17:02 (before 17:05)
        fetchedAt: new Date(baseTime.getTime() + 30 * 60 * 1000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/503/',
      });

      await service.processBatch(10);

      const updatedBattles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(updatedBattles).toHaveLength(1);
      expect(BigInt(updatedBattles[0].totalKills)).toBe(3n);

      // Start time should be extended backwards
      expect(updatedBattles[0].startTime.getTime()).toBeLessThan(originalStartTime.getTime());
      expect(updatedBattles[0].endTime.getTime()).toBe(originalEndTime.getTime());
    });

    it('updates battle ISK destroyed when adding retroactive killmail', async () => {
      const baseTime = new Date('2024-05-01T18:00:00Z');

      // Create initial battle
      await killmailRepository.insert({
        killmailId: 601n,
        occurredAt: baseTime,
        fetchedAt: new Date(baseTime.getTime() + 5000),
        ...baseReference,
        iskValue: 100_000_000n,
        zkbUrl: 'https://zkillboard.com/kill/601/',
      });
      await killmailRepository.insert({
        killmailId: 602n,
        occurredAt: new Date(baseTime.getTime() + 3 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 3 * 60 * 1000 + 5000),
        ...baseReference,
        iskValue: 200_000_000n,
        attackerAllianceIds: [99002345n],
        zkbUrl: 'https://zkillboard.com/kill/602/',
      });

      await service.processBatch(10);
      const battles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(BigInt(battles[0].totalIskDestroyed)).toBe(300_000_000n);

      // Late killmail with high ISK value
      await killmailRepository.insert({
        killmailId: 603n,
        occurredAt: new Date(baseTime.getTime() + 1 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 30 * 60 * 1000),
        ...baseReference,
        iskValue: 500_000_000n, // High value kill
        zkbUrl: 'https://zkillboard.com/kill/603/',
      });

      await service.processBatch(10);

      const updatedBattles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(BigInt(updatedBattles[0].totalIskDestroyed)).toBe(800_000_000n); // 300M + 500M
    });

    it('creates new battle if late killmail is outside time window', async () => {
      const baseTime = new Date('2024-05-01T19:00:00Z');

      // Create initial battle
      await killmailRepository.insert({
        killmailId: 701n,
        occurredAt: baseTime,
        fetchedAt: new Date(baseTime.getTime() + 5000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/701/',
      });
      await killmailRepository.insert({
        killmailId: 702n,
        occurredAt: new Date(baseTime.getTime() + 3 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 3 * 60 * 1000 + 5000),
        ...baseReference,
        attackerAllianceIds: [99002345n],
        zkbUrl: 'https://zkillboard.com/kill/702/',
      });

      await service.processBatch(10);
      const battles1 = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(battles1).toHaveLength(1);

      // Killmail that occurred 90 minutes later (outside 60 min lookback window)
      await killmailRepository.insert({
        killmailId: 703n,
        occurredAt: new Date(baseTime.getTime() + 90 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 120 * 60 * 1000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/703/',
      });
      await killmailRepository.insert({
        killmailId: 704n,
        occurredAt: new Date(baseTime.getTime() + 92 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 122 * 60 * 1000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/704/',
      });

      await service.processBatch(10);

      // Should create a new battle, not update the existing one
      const battles2 = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(battles2).toHaveLength(2);

      const oldBattle = battles2.find((b) => b.id === battles1[0].id);
      expect(oldBattle).toBeDefined();
      expect(BigInt(oldBattle!.totalKills)).toBe(2n); // Unchanged
    });

    it('adds participants from retroactive killmail to battle', async () => {
      const baseTime = new Date('2024-05-01T20:00:00Z');

      // Create initial battle with specific participants
      await killmailRepository.insert({
        killmailId: 801n,
        occurredAt: baseTime,
        fetchedAt: new Date(baseTime.getTime() + 5000),
        systemId: 30000142n,
        victimCharacterId: 100_000_001n,
        victimCorpId: 1_000_001n,
        victimAllianceId: 99001000n,
        attackerCharacterIds: [100_000_002n],
        attackerCorpIds: [1_000_002n],
        attackerAllianceIds: [99002000n],
        iskValue: 100_000_000n,
        zkbUrl: 'https://zkillboard.com/kill/801/',
      });
      await killmailRepository.insert({
        killmailId: 802n,
        occurredAt: new Date(baseTime.getTime() + 3 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 3 * 60 * 1000 + 5000),
        systemId: 30000142n,
        victimCharacterId: 100_000_003n,
        victimCorpId: 1_000_003n,
        victimAllianceId: 99002000n,
        attackerCharacterIds: [100_000_004n],
        attackerCorpIds: [1_000_004n],
        attackerAllianceIds: [99001000n],
        iskValue: 150_000_000n,
        zkbUrl: 'https://zkillboard.com/kill/802/',
      });

      await service.processBatch(10);
      const battles = await testDb.db.selectFrom('battles').selectAll().execute();
      const battleId = battles[0].id;

      const initialParticipants = await testDb.db
        .selectFrom('battle_participants')
        .selectAll()
        .where('battleId', '=', battleId)
        .execute();
      const initialCharacterIds = new Set(
        initialParticipants.map((p) => p.characterId.toString()),
      );

      // Late killmail with NEW participants
      await killmailRepository.insert({
        killmailId: 803n,
        occurredAt: new Date(baseTime.getTime() + 1 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 30 * 60 * 1000),
        systemId: 30000142n,
        victimCharacterId: 100_000_005n, // New character
        victimCorpId: 1_000_005n,
        victimAllianceId: 99001000n,
        attackerCharacterIds: [100_000_006n], // New character
        attackerCorpIds: [1_000_006n],
        attackerAllianceIds: [99002000n],
        iskValue: 200_000_000n,
        zkbUrl: 'https://zkillboard.com/kill/803/',
      });

      await service.processBatch(10);

      const updatedParticipants = await testDb.db
        .selectFrom('battle_participants')
        .selectAll()
        .where('battleId', '=', battleId)
        .execute();

      const updatedCharacterIds = new Set(
        updatedParticipants.map((p) => p.characterId.toString()),
      );

      // Should have original participants plus new ones
      expect(updatedParticipants.length).toBeGreaterThan(initialParticipants.length);
      expect(updatedCharacterIds.has('100000005')).toBe(true); // New victim
      expect(updatedCharacterIds.has('100000006')).toBe(true); // New attacker

      // Original participants should still be there
      for (const charId of initialCharacterIds) {
        expect(updatedCharacterIds.has(charId)).toBe(true);
      }
    });

    it('handles multiple late killmails for the same battle in one batch', async () => {
      const baseTime = new Date('2024-05-01T21:00:00Z');

      // Create initial battle
      await killmailRepository.insert({
        killmailId: 901n,
        occurredAt: baseTime,
        fetchedAt: new Date(baseTime.getTime() + 5000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/901/',
      });
      await killmailRepository.insert({
        killmailId: 902n,
        occurredAt: new Date(baseTime.getTime() + 5 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 5 * 60 * 1000 + 5000),
        ...baseReference,
        attackerAllianceIds: [99002345n],
        zkbUrl: 'https://zkillboard.com/kill/902/',
      });

      await service.processBatch(10);
      const battles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(battles).toHaveLength(1);
      const battleId = battles[0].id;

      // Insert 3 late killmails at once
      await killmailRepository.insert({
        killmailId: 903n,
        occurredAt: new Date(baseTime.getTime() + 1 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 30 * 60 * 1000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/903/',
      });
      await killmailRepository.insert({
        killmailId: 904n,
        occurredAt: new Date(baseTime.getTime() + 2 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 30 * 60 * 1000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/904/',
      });
      await killmailRepository.insert({
        killmailId: 905n,
        occurredAt: new Date(baseTime.getTime() + 3 * 60 * 1000),
        fetchedAt: new Date(baseTime.getTime() + 30 * 60 * 1000),
        ...baseReference,
        zkbUrl: 'https://zkillboard.com/kill/905/',
      });

      await service.processBatch(10);

      // Should still be only 1 battle
      const updatedBattles = await testDb.db.selectFrom('battles').selectAll().execute();
      expect(updatedBattles).toHaveLength(1);
      expect(updatedBattles[0].id).toBe(battleId);
      expect(BigInt(updatedBattles[0].totalKills)).toBe(5n); // 2 + 3

      // Verify all 5 killmails are in the battle
      const battleKillmails = await testDb.db
        .selectFrom('battle_killmails')
        .selectAll()
        .where('battleId', '=', battleId)
        .execute();
      expect(battleKillmails).toHaveLength(5);
    });
  });
});
