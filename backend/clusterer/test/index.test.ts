import { start } from '../src/index';

describe('clusterer placeholder', () => {
  it('starts without throwing', async () => {
    await expect(start()).resolves.toBeUndefined();
  });
});
