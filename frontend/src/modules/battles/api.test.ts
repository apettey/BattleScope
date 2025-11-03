import { describe, expect, it, vi } from 'vitest';
import { fetchBattles, fetchBattleDetail, BattleSummarySchema, BattleDetailSchema } from './api';

const sampleSummary = {
  id: '5f2e5e02-0d75-4a47-8618-6c526d5e62c8',
  systemId: 31000123,
  spaceType: 'jspace',
  startTime: '2024-05-01T10:00:00.000Z',
  endTime: '2024-05-01T10:05:00.000Z',
  totalKills: 6,
  totalIskDestroyed: '980000000',
  zkillRelatedUrl: 'https://zkillboard.com/related/31000123/202405011000/',
};

const sampleDetail = {
  ...sampleSummary,
  createdAt: '2024-05-01T10:05:00.000Z',
  killmails: [
    {
      killmailId: 90000001,
      occurredAt: '2024-05-01T10:01:00.000Z',
      victimAllianceId: 99001234,
      victimCorpId: 123456,
      victimCharacterId: '700000200000000001',
      attackerAllianceIds: [99005678],
      attackerCorpIds: [987654],
      attackerCharacterIds: ['800000300000000002'],
      iskValue: '450000000',
      zkbUrl: 'https://zkillboard.com/kill/90000001/',
      enrichment: {
        status: 'succeeded',
        payload: { key: 'value' },
        error: null,
        fetchedAt: '2024-05-01T10:02:00.000Z',
        updatedAt: '2024-05-01T10:02:30.000Z',
        createdAt: '2024-05-01T10:01:45.000Z',
      },
    },
  ],
  participants: [
    {
      battleId: sampleSummary.id,
      characterId: 7000001,
      allianceId: 99001234,
      corpId: 123456,
      shipTypeId: 603,
      sideId: 1,
      isVictim: false,
    },
  ],
};

describe('battles api', () => {
  it('parses battle list responses', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [sampleSummary], nextCursor: 'cursor-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const result = await fetchBattles({ fetchFn });
    expect(result.nextCursor).toBe('cursor-1');
    expect(result.items).toHaveLength(1);
    expect(() => BattleSummarySchema.parse(result.items[0])).not.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('parses battle detail responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(sampleDetail), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const controller = new AbortController();
    const result = await fetchBattleDetail(sampleSummary.id, {
      fetchFn,
      signal: controller.signal,
    });
    expect(result.id).toBe(sampleSummary.id);
    expect(result.killmails[0].enrichment?.status).toBe('succeeded');
    expect(() => BattleDetailSchema.parse(result)).not.toThrow();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain(sampleSummary.id);
    expect((init as RequestInit | undefined)?.signal).toBe(controller.signal);
  });

  it('throws on non-200 responses', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 500, statusText: 'boom' }));

    await expect(fetchBattles({ fetchFn })).rejects.toThrow(/Request failed/);
  });
});
