import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import {
  BattleRepository,
  KillmailRepository,
  createInMemoryDatabase,
} from '@battlescope/database';
import { buildServer } from '../src/server';

const createBattle = async (
  battleRepository: BattleRepository,
  killmailRepository: KillmailRepository,
  battleId: string,
  killmailBase: {
    killmailId: number;
    systemId: number;
    occurredAt: Date;
    victimAllianceId: number | null;
    victimCorpId: number | null;
    victimCharacterId: bigint | null;
    attackerAllianceIds: number[];
    attackerCorpIds: number[];
    attackerCharacterIds: bigint[];
    iskValue: bigint | null;
    zkbUrl: string;
  },
  overrides?: Partial<typeof killmailBase>,
) => {
  const killmail = { ...killmailBase, ...overrides };
  await killmailRepository.insert(killmail);

  await battleRepository.createBattle({
    id: battleId,
    systemId: killmail.systemId,
    spaceType: 'jspace',
    startTime: killmail.occurredAt,
    endTime: new Date(killmail.occurredAt.getTime() + 5 * 60 * 1000),
    totalKills: 1,
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

describe('API battles routes', () => {
  let app: FastifyInstance;
  let db: Awaited<ReturnType<typeof createInMemoryDatabase>>;

  beforeAll(async () => {
    db = await createInMemoryDatabase();
    const battleRepository = new BattleRepository(db.db);
    const killmailRepository = new KillmailRepository(db.db);

    const baseKillmail = {
      killmailId: 1001,
      systemId: 31000123,
      occurredAt: new Date('2024-05-01T10:00:00Z'),
      victimAllianceId: 99001234,
      victimCorpId: 12345,
      victimCharacterId: 700_000_001n,
      attackerAllianceIds: [99002345],
      attackerCorpIds: [67890],
      attackerCharacterIds: [800_000_002n],
      iskValue: 400_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/1001/',
    };

    const battleId = randomUUID();
    await createBattle(battleRepository, killmailRepository, battleId, baseKillmail);

    const secondBattleId = randomUUID();
    await killmailRepository.insert({
      killmailId: 2001,
      systemId: 30000111,
      occurredAt: new Date('2024-05-02T15:00:00Z'),
      victimAllianceId: 99003333,
      victimCorpId: 54321,
      victimCharacterId: 700_000_100n,
      attackerAllianceIds: [99004444],
      attackerCorpIds: [11111],
      attackerCharacterIds: [800_000_200n],
      iskValue: 125_000_000n,
      zkbUrl: 'https://zkillboard.com/kill/2001/',
    });

    await battleRepository.createBattle({
      id: secondBattleId,
      systemId: 30000111,
      spaceType: 'kspace',
      startTime: new Date('2024-05-02T15:00:00Z'),
      endTime: new Date('2024-05-02T15:10:00Z'),
      totalKills: 1,
      totalIskDestroyed: 125_000_000n,
      zkillRelatedUrl: 'https://zkillboard.com/related/30000111/202405021500/',
    });

    await battleRepository.upsertKillmails([
      {
        battleId: secondBattleId,
        killmailId: 2001,
        zkbUrl: 'https://zkillboard.com/kill/2001/',
        occurredAt: new Date('2024-05-02T15:00:00Z'),
        victimAllianceId: 99003333,
        attackerAllianceIds: [99004444],
        iskValue: 125_000_000n,
        sideId: null,
      },
    ]);

    await killmailRepository.markAsProcessed([2001], secondBattleId);

    app = buildServer({ battleRepository, db: db.db });
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
    expect(body.nextCursor).toBeTruthy();
  });

  it('filters battles by alliance id', async () => {
    const response = await app.inject({ method: 'GET', url: '/battles?allianceId=99001234' });
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].systemId).toBe(31000123);
  });

  it('returns battles for a character', async () => {
    const response = await app.inject({ method: 'GET', url: '/characters/700000001/battles' });
    const body = response.json();
    expect(body.items).toHaveLength(1);
  });

  it('returns battle detail with killmail references', async () => {
    const list = await app.inject({ method: 'GET', url: '/battles?limit=1' });
    const battleId = list.json().items[0].id;

    const response = await app.inject({ method: 'GET', url: `/battles/${battleId}` });
    expect(response.statusCode).toBe(200);
    const detail = response.json();
    expect(detail.killmails[0]).toMatchObject({
      zkbUrl: expect.stringContaining('/kill/'),
      iskValue: expect.any(String),
      attackerCharacterIds: expect.arrayContaining([expect.any(String)]),
    });
  });
});
