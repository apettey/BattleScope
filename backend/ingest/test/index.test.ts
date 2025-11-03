import { start } from '../src/index';

describe('ingest placeholder', () => {
  it('starts without throwing', async () => {
    await expect(start()).resolves.toBeUndefined();
  });
});
