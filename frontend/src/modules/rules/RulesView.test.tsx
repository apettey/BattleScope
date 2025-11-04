import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { RulesView } from './RulesView.js';

vi.mock('./api', () => ({
  fetchCurrentRuleset: vi.fn(),
  updateRuleset: vi.fn(),
}));

import { fetchCurrentRuleset, updateRuleset } from './api.js';
const fetchCurrentRulesetMock = vi.mocked(fetchCurrentRuleset);
const updateRulesetMock = vi.mocked(updateRuleset);

const baseRuleset = {
  id: '00000000-0000-0000-0000-000000000001',
  minPilots: 1,
  trackedAllianceIds: [] as string[],
  trackedCorpIds: [] as string[],
  ignoreUnlisted: false,
  updatedBy: null,
  createdAt: '2024-05-01T10:00:00.000Z',
  updatedAt: '2024-05-01T10:00:00.000Z',
};

describe('RulesView', () => {
  beforeEach(() => {
    fetchCurrentRulesetMock.mockReset();
    updateRulesetMock.mockReset();
    fetchCurrentRulesetMock.mockResolvedValue(baseRuleset);
    updateRulesetMock.mockResolvedValue({
      ...baseRuleset,
      minPilots: 2,
      trackedAllianceIds: ['99001234'],
      updatedBy: 'ops',
    });
  });

  it('submits updated ruleset', async () => {
    render(<RulesView />);

    expect(await screen.findByLabelText(/Minimum pilots/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Minimum pilots/));
    await user.type(screen.getByLabelText(/Minimum pilots/), '2');
    await user.type(screen.getByLabelText(/Tracked alliance IDs/), '99001234');
    await user.click(screen.getByLabelText(/Ignore killmails/));
    await user.type(screen.getByLabelText(/Change note/), 'ops');

    await user.click(screen.getByRole('button', { name: /Save rules/ }));

    expect(updateRulesetMock).toHaveBeenCalledWith({
      minPilots: 2,
      trackedAllianceIds: ['99001234'],
      trackedCorpIds: [],
      ignoreUnlisted: true,
      updatedBy: 'ops',
    });
    expect(await screen.findByText(/Rules updated successfully/)).toBeInTheDocument();
  });
});
