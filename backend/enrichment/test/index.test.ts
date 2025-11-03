import { start } from '../src/index';

describe('enrichment placeholder', () => {
  it('starts without throwing', async () => {
    await expect(start()).resolves.toBeUndefined();
  });
});
