import { start } from '../src/index';

describe('scheduler placeholder', () => {
  it('starts without throwing', async () => {
    await expect(start()).resolves.toBeUndefined();
  });
});
