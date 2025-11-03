import { battleSchema } from '../src/index';

describe('database package', () => {
  it('validates battle record schema', () => {
    const record = battleSchema.parse({
      id: 'f6ca7f07-9e9d-4457-a3c4-f3fbd3ae37e9',
      systemId: 31000123,
      spaceType: 'jspace',
      startTime: new Date('2025-11-03T18:00:00Z'),
      endTime: new Date('2025-11-03T18:05:00Z'),
      totalKills: 5,
      totalIskDestroyed: BigInt(1000000000),
      zkillRelatedUrl: 'https://zkillboard.com/related/31000123/202511031800/',
    });
    expect(record.systemId).toBe(31000123);
  });
});
