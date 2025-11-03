import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KillmailRepository } from '../src/repositories/killmail-repository';
import { createTestDatabase, type TestDatabase } from './test-db';

let testDb: TestDatabase | undefined;
let repository: KillmailRepository;

beforeAll(async () => {
  testDb = await createTestDatabase();
  repository = new KillmailRepository(testDb.db);
});

afterAll(async () => {
  if (testDb) {
    await testDb.destroy();
  }
});

describe('KillmailRepository', () => {
  const baseEvent = {
    killmailId: 42,
    systemId: 30000142,
    occurredAt: new Date('2024-05-01T10:00:00Z'),
    victimAllianceId: 99001234,
    attackerAllianceIds: [99001111],
    iskValue: 200_000_000n,
    zkbUrl: 'https://zkillboard.com/kill/42/',
  };

  it('stores new killmail events and skips duplicates', async () => {
    const firstInsert = await repository.insert(baseEvent);
    const secondInsert = await repository.insert(baseEvent);

    expect(firstInsert).toBe(true);
    expect(secondInsert).toBe(false);

    const events = await repository.fetchUnprocessed();
    expect(events).toHaveLength(1);
    expect(events[0].iskValue).toBe(200_000_000n);
  });

  it('marks killmails as processed without battle association', async () => {
    const events = await repository.fetchUnprocessed();
    expect(events).toHaveLength(1);

    await repository.markAsProcessed([events[0].killmailId], null);

    const remaining = await repository.fetchUnprocessed();
    expect(remaining).toHaveLength(0);
  });
});
