import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BattleRepository } from '../src/repositories/battle-repository.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

let testDb: TestDatabase | undefined;
let repository: BattleRepository;

beforeAll(async () => {
  testDb = await createTestDatabase();
  repository = new BattleRepository(testDb.db);
});

afterAll(async () => {
  if (testDb) {
    await testDb.destroy();
  }
});

describe('BattleRepository', () => {
  const battleId = 'f6ca7f07-9e9d-4457-a3c4-f3fbd3ae37e9';

  it('creates battles with typed validation', async () => {
    const battle = await repository.createBattle({
      id: battleId,
      systemId: 31000123,
      spaceType: 'jspace',
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T12:15:00Z'),
      totalKills: 4,
      totalIskDestroyed: 1_500_000_000n,
      zkillRelatedUrl: 'https://zkillboard.com/related/31000123/202405011200/',
    });

    expect(battle.id).toBe(battleId);
    expect(battle.totalIskDestroyed).toBe(1_500_000_000n);
    expect(battle.createdAt).toBeInstanceOf(Date);
  });

  it('upserts killmails without creating duplicates', async () => {
    await repository.upsertKillmails([
      {
        battleId,
        killmailId: 9001,
        zkbUrl: 'https://zkillboard.com/kill/9001/',
        occurredAt: new Date('2024-05-01T12:01:00Z'),
        victimAllianceId: 99001234,
        attackerAllianceIds: [99004567, 99002345],
        iskValue: 500_000_000n,
        sideId: 0,
      },
    ]);

    // second call should update sideId without inserting another row
    await repository.upsertKillmails([
      {
        battleId,
        killmailId: 9001,
        zkbUrl: 'https://zkillboard.com/kill/9001/',
        occurredAt: new Date('2024-05-01T12:01:00Z'),
        victimAllianceId: 99001234,
        attackerAllianceIds: [99004567, 99002345],
        iskValue: 500_000_000n,
        sideId: 1,
      },
    ]);

    const battle = await repository.getBattleById(battleId);
    expect(battle?.killmails).toHaveLength(1);
    expect(battle?.killmails[0].sideId).toBe(1);
    expect(battle?.killmails[0].iskValue).toBe(500_000_000n);
  });

  it('upserts participants idempotently', async () => {
    await repository.upsertParticipants([
      {
        battleId,
        characterId: 123,
        allianceId: 99004567,
        corpId: 12345,
        shipTypeId: 456,
        sideId: 0,
        isVictim: false,
      },
    ]);

    await repository.upsertParticipants([
      {
        battleId,
        characterId: 123,
        allianceId: 99004567,
        corpId: 12345,
        shipTypeId: 456,
        sideId: 1,
        isVictim: true,
      },
    ]);

    const battle = await repository.getBattleById(battleId);
    expect(battle?.participants).toHaveLength(1);
    expect(battle?.participants[0].sideId).toBe(1);
    expect(battle?.participants[0].isVictim).toBe(true);
  });
});
