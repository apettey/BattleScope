import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from './test-db';
import { KillmailEnrichmentRepository } from '../src/repositories/killmail-enrichment-repository';

describe('KillmailEnrichmentRepository', () => {
  let repository: KillmailEnrichmentRepository;
  let db: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    db = await createTestDatabase();
    repository = new KillmailEnrichmentRepository(db.db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('upserts pending and success states', async () => {
    await repository.upsertPending(123);
    let record = await repository.find(123);
    expect(record?.status).toBe('pending');

    const fetchedAt = new Date('2024-05-01T12:00:00Z');
    await repository.markSucceeded(123, { value: 'payload' }, fetchedAt);
    record = await repository.find(123);
    expect(record?.status).toBe('succeeded');
    expect(record?.payload).toEqual({ value: 'payload' });
    expect(record?.fetchedAt?.toISOString()).toBe(fetchedAt.toISOString());
  });

  it('marks failures', async () => {
    await repository.markFailed(999, 'timeout');
    const record = await repository.find(999);
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe('timeout');
    expect(record?.payload).toBeNull();
    expect(record?.fetchedAt).toBeNull();
  });

  it('lists enrichments by status', async () => {
    await repository.upsertPending(111);
    await repository.markProcessing(111);
    await repository.markSucceeded(222, { foo: 'bar' }, new Date('2024-01-01T00:00:00Z'));
    await repository.markFailed(333, 'oops');

    const processing = await repository.listByStatus('processing');
    expect(processing.map((item) => item.killmailId)).toContain(111);

    const failed = await repository.listByStatus('failed');
    expect(failed.map((item) => item.killmailId)).toContain(333);
  });
});
