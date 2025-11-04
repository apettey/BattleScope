import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { HomeView } from './HomeView.js';

vi.mock('../dashboard/api', () => ({
  fetchDashboardSummary: vi.fn(),
}));

import { fetchDashboardSummary } from '../dashboard/api.js';
const fetchDashboardSummaryMock = vi.mocked(fetchDashboardSummary);

describe('HomeView', () => {
  beforeEach(() => {
    fetchDashboardSummaryMock.mockReset();
  });

  it('renders summary metrics', async () => {
    fetchDashboardSummaryMock.mockResolvedValue({
      totalBattles: 42,
      totalKillmails: 100,
      uniqueAlliances: 10,
      uniqueCorporations: 12,
      topAlliances: [{ allianceId: '99001234', allianceName: 'Test Alliance', battleCount: 8 }],
      topCorporations: [{ corpId: '123456', corpName: 'Test Corporation', battleCount: 6 }],
      generatedAt: '2024-05-01T12:00:00.000Z',
    });

    render(<HomeView />);

    expect(await screen.findByText(/Total Battles/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/Test Alliance/)).toBeInTheDocument();
    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(1);
  });

  it('triggers manual refresh', async () => {
    fetchDashboardSummaryMock.mockResolvedValueOnce({
      totalBattles: 1,
      totalKillmails: 1,
      uniqueAlliances: 1,
      uniqueCorporations: 1,
      topAlliances: [],
      topCorporations: [],
      generatedAt: '2024-05-01T12:00:00.000Z',
    });
    fetchDashboardSummaryMock.mockResolvedValueOnce({
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

    const user = userEvent.setup();
    await user.click(refreshButton);

    expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(2);
  });
});
