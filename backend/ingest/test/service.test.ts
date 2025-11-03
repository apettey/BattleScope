import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KillmailRepository } from '@battlescope/database';
import { IngestionService } from '../src/service';
import { MockKillmailSource } from '../src/source';
import { createTestDb } from './helpers';

const reference = {
  killmailId: 9001,
  systemId: 30000142,
  occurredAt: new Date('2024-05-01T12:00:00Z'),
  victimAllianceId: 99001234,
  attackerAllianceIds: [99004567, 99002345],
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
    const service = new IngestionService(
      repository,
      new MockKillmailSource([reference, reference]),
    );

    const first = await service.processNext();
    const second = await service.processNext();
    const third = await service.processNext();

    expect(first).toBe('stored');
    expect(second).toBe('duplicate');
    expect(third).toBe('empty');

    const remaining = await repository.fetchUnprocessed();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].killmailId).toBe(reference.killmailId);
  });
});
