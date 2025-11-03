import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { App } from './index';

describe('App', () => {
  it('renders placeholder heading', () => {
    const { getByText } = render(<App />);
    expect(getByText(/BattleScope Frontend Placeholder/)).toBeTruthy();
  });
});
