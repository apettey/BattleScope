import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KillmailRepository } from '@battlescope/database';
import { IngestionService } from '../src/service.js';
import { MockKillmailSource } from '../src/source.js';
import { createTestDb } from './helpers.js';

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
  let repository: KillmailRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repository = new KillmailRepository(db.db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('stores killmail references and deduplicates', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const service = new IngestionService(
      repository,
      new MockKillmailSource([reference, reference]),
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

    const remaining = await repository.fetchUnprocessed();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].killmailId).toBe(reference.killmailId);
  });
});
