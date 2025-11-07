export type SpaceType = 'kspace' | 'jspace' | 'pochven';

export const deriveSpaceType = (systemId: bigint | number): SpaceType => {
  const value = typeof systemId === 'bigint' ? Number(systemId) : systemId;

  if (value >= 32_000_000 && value < 33_000_000) {
    return 'pochven';
  }

  if (value >= 31_000_000 && value < 32_000_000) {
    return 'jspace';
  }

  return 'kspace';
};
