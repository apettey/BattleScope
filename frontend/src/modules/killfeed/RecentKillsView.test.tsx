import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { RecentKillsView } from './RecentKillsView.js';
import { AuthProvider } from '../auth/AuthContext.js';

vi.mock('./api', () => ({
  fetchRecentKillmails: vi.fn(),
  createKillmailStream: vi.fn(),
  formatParticipantCount: (count: number) => `${count} pilots`,
}));

vi.mock('../auth/api', () => ({
  fetchMe: vi.fn().mockResolvedValue({
    accountId: 'test-account-id',
    displayName: 'Test User',
    isSuperAdmin: false,
    primaryCharacter: null,
    characters: [],
    featureRoles: [],
  }),
  logout: vi.fn(),
}));

import { fetchRecentKillmails, createKillmailStream, type KillmailStreamOptions } from './api.js';
const fetchRecentKillmailsMock = vi.mocked(fetchRecentKillmails);
const createKillmailStreamMock = vi.mocked(createKillmailStream);

const baseItem = {
  killmailId: '1',
  systemId: '30000123',
  systemName: 'Jita',
  occurredAt: '2024-05-01T10:00:00.000Z',
  spaceType: 'kspace' as const,
  victimAllianceId: '99001234',
  victimAllianceName: 'Test Alliance',
  victimCorpId: '123456',
  victimCorpName: 'Test Corp',
  victimCharacterId: '7000001',
  victimCharacterName: 'Test Pilot',
  attackerAllianceIds: ['99002345'],
  attackerAllianceNames: ['Attacker Alliance'],
  attackerCorpIds: ['654321'],
  attackerCorpNames: ['Attacker Corp'],
  attackerCharacterIds: ['8000002'],
  attackerCharacterNames: ['Attacker Pilot'],
  iskValue: '100000000',
  zkbUrl: 'https://zkillboard.com/kill/1/',
  battleId: null,
  participantCount: 2,
};

describe('RecentKillsView', () => {
  beforeEach(() => {
    fetchRecentKillmailsMock.mockReset();
    createKillmailStreamMock.mockReset();
  });

  it('renders snapshot and applies updates', async () => {
    fetchRecentKillmailsMock.mockResolvedValue({ items: [baseItem], count: 1 });

    let handlers: KillmailStreamOptions | null = null;
    createKillmailStreamMock.mockImplementation((options: KillmailStreamOptions) => {
      handlers = options;
      return () => {};
    });

    render(
      <AuthProvider>
        <RecentKillsView />
      </AuthProvider>,
    );

    expect(await screen.findByText(/Jita/)).toBeInTheDocument();
    expect(createKillmailStreamMock).toHaveBeenCalled();

    await act(async () => {
      handlers?.onUpdate?.({
        ...baseItem,
        killmailId: '2',
        systemId: '31000123',
        systemName: 'J115422',
        spaceType: 'jspace',
        occurredAt: '2024-05-01T10:01:00.000Z',
      });
    });

    expect(await screen.findByText(/J115422/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: /Known Space/ }));

    expect(await screen.findByText(/J115422/)).toBeInTheDocument();
    expect(screen.queryByText(/Jita/)).not.toBeInTheDocument();
  });
});
