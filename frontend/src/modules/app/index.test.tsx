import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import type * as BattlesApi from '../battles/api.js';
import { App } from './index.js';

type BattlesApiModule = typeof BattlesApi;

vi.mock('../battles/api', async () => {
  const actual = (await vi.importActual('../battles/api')) as BattlesApiModule;
  return {
    ...actual,
    fetchBattles: vi.fn(),
    fetchBattleDetail: vi.fn(),
  } as BattlesApiModule;
});

import { fetchBattles, fetchBattleDetail } from '../battles/api.js';

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
        status: 'succeeded' as const,
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

describe('App', () => {
  const mockedFetchBattles = fetchBattles as unknown as Mock;
  const mockedFetchBattleDetail = fetchBattleDetail as unknown as Mock;

  beforeEach(() => {
    mockedFetchBattles.mockReset();
    mockedFetchBattleDetail.mockReset();
  });

  it('renders battle feed and enrichment details', async () => {
    mockedFetchBattles.mockResolvedValue({ items: [sampleSummary], nextCursor: null });
    mockedFetchBattleDetail.mockResolvedValue(sampleDetail);

    render(<App />);

    expect(await screen.findByText(/Recent Battles/)).toBeInTheDocument();
    expect(await screen.findByText(/BattleScope Operations Console/)).toBeInTheDocument();
    expect(await screen.findByText(/Killmail #90000001/)).toBeInTheDocument();
    expect(screen.getByText(/Enrichment: succeeded/)).toBeInTheDocument();
  });
});
