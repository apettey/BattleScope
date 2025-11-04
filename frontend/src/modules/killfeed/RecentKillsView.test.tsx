import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentKillsView } from './RecentKillsView.js';

vi.mock('./api', () => ({
  fetchRecentKillmails: vi.fn(),
  createKillmailStream: vi.fn(),
  formatParticipantCount: (count: number) => `${count} pilots`,
}));

import { fetchRecentKillmails, createKillmailStream } from './api.js';

const baseItem = {
  killmailId: '1',
  systemId: '30000123',
  occurredAt: '2024-05-01T10:00:00.000Z',
  spaceType: 'kspace' as const,
  victimAllianceId: '99001234',
  victimCorpId: '123456',
  victimCharacterId: '7000001',
  attackerAllianceIds: ['99002345'],
  attackerCorpIds: ['654321'],
  attackerCharacterIds: ['8000002'],
  iskValue: '100000000',
  zkbUrl: 'https://zkillboard.com/kill/1/',
  battleId: null,
  participantCount: 2,
};

describe('RecentKillsView', () => {
  beforeEach(() => {
    fetchRecentKillmails.mockReset();
    createKillmailStream.mockReset();
  });

  it('renders snapshot and applies updates', async () => {
    fetchRecentKillmails.mockResolvedValue({ items: [baseItem], count: 1 });

    let handlers: Parameters<typeof createKillmailStream>[0] | null = null;
    createKillmailStream.mockImplementation((options) => {
      handlers = options;
      return () => {};
    });

    render(<RecentKillsView />);

    expect(await screen.findByText(/Kill #1/)).toBeInTheDocument();
    expect(createKillmailStream).toHaveBeenCalled();

    await act(async () => {
      handlers?.onUpdate?.({
        ...baseItem,
        killmailId: '2',
        systemId: '31000123',
        spaceType: 'jspace',
        occurredAt: '2024-05-01T10:01:00.000Z',
      });
    });

    expect(await screen.findByText(/Kill #2/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Known Space/ }));

    expect(await screen.findByText(/Kill #2/)).toBeInTheDocument();
    expect(screen.queryByText(/Kill #1/)).not.toBeInTheDocument();
  });
});
