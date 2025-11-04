import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeView } from './HomeView.js';

vi.mock('../dashboard/api', () => ({
  fetchDashboardSummary: vi.fn(),
}));

import { fetchDashboardSummary } from '../dashboard/api.js';

describe('HomeView', () => {
  beforeEach(() => {
    fetchDashboardSummary.mockReset();
  });

  it('renders summary metrics', async () => {
    fetchDashboardSummary.mockResolvedValue({
      totalBattles: 42,
      totalKillmails: 100,
      uniqueAlliances: 10,
      uniqueCorporations: 12,
      topAlliances: [{ allianceId: '99001234', battleCount: 8 }],
      topCorporations: [{ corpId: '123456', battleCount: 6 }],
      generatedAt: '2024-05-01T12:00:00.000Z',
    });

    render(<HomeView />);

    expect(await screen.findByText(/Total Battles/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Alliance 99001234/)).toBeInTheDocument();
    expect(fetchDashboardSummary).toHaveBeenCalledTimes(1);
  });

  it('triggers manual refresh', async () => {
    fetchDashboardSummary.mockResolvedValueOnce({
      totalBattles: 1,
      totalKillmails: 1,
      uniqueAlliances: 1,
      uniqueCorporations: 1,
      topAlliances: [],
      topCorporations: [],
      generatedAt: '2024-05-01T12:00:00.000Z',
    });
    fetchDashboardSummary.mockResolvedValueOnce({
      totalBattles: 2,
      totalKillmails: 3,
      uniqueAlliances: 1,
      uniqueCorporations: 1,
      topAlliances: [],
      topCorporations: [],
      generatedAt: '2024-05-01T12:01:00.000Z',
    });

    render(<HomeView />);

    const refreshButton = await screen.findByRole('button', { name: /refresh now/i });

    await userEvent.click(refreshButton);

    expect(fetchDashboardSummary).toHaveBeenCalledTimes(2);
  });
});
